import { useEffect, useMemo, useState } from "react";
import { Check, FileText, FileDown, CalendarRange, Lock, Pencil, History } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { asegurarTrimestres, trimestrePorFecha } from "../lib/trimestres";
import { StatusPill, ESTADOS_ASISTENCIA } from "../components/ui";
import HistorialAsistenciaModal from "../components/HistorialAsistenciaModal";
import {
  exportarAsistenciaDiaPdf,
  exportarAsistenciaDiaExcel,
  exportarAsistenciaMesPdf,
  exportarAsistenciaMesExcel,
} from "../lib/exportAsistencia";

export default function Asistencia() {
  const { user } = useAuth();
  const { institutionName } = useSettings();
  const [subjects, setSubjects] = useState([]);
  const [courses, setCourses] = useState([]);
  const [parallels, setParallels] = useState([]);
  const [students, setStudents] = useState([]);

  const [subjectId, setSubjectId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [parallelId, setParallelId] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));

  const [classSessionId, setClassSessionId] = useState(null);
  const [estados, setEstados] = useState({});
  // Asistencias que ya están guardadas en la base de datos (quedan bloqueadas para evitar cambios por error).
  const [guardados, setGuardados] = useState({});
  // Alumnos cuya asistencia guardada se habilitó para editar con doble clic.
  const [editables, setEditables] = useState(() => new Set());
  const [errorGuardar, setErrorGuardar] = useState("");
  const [filaActiva, setFilaActiva] = useState(null); // alumno donde está situado el usuario
  const [periodos, setPeriodos] = useState([]);
  const [avisoTrimestres, setAvisoTrimestres] = useState("");
  // true si la tabla class_sessions tiene la columna academic_period_id (se comprueba al abrir).
  const [sesionTieneTrimestre, setSesionTieneTrimestre] = useState(false);
  const [saved, setSaved] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [generandoMes, setGenerandoMes] = useState(false);
  const [avisoMes, setAvisoMes] = useState("");
  const [showHistorial, setShowHistorial] = useState(false);

  useEffect(() => {
    async function cargarBase() {
      const [{ data: subj }, { data: cur }, { data: par }] = await Promise.all([
        supabase.from("subjects").select("*").eq("active", true).order("name"),
        supabase.from("courses").select("*").eq("active", true).order("name"),
        supabase.from("parallels").select("*").eq("active", true).order("name"),
      ]);
      setSubjects(subj || []);
      setCourses(cur || []);
      setParallels(par || []);

      // Crea los trimestres 1, 2 y 3 que falten y deja activo el vigente.
      const { periodos: per, aviso } = await asegurarTrimestres(supabase);
      setPeriodos(per);
      setAvisoTrimestres(aviso || "");

      const { error: errCol } = await supabase.from("class_sessions").select("academic_period_id").limit(1);
      setSesionTieneTrimestre(!errCol);
    }
    cargarBase();
  }, []);

  // El trimestre de una asistencia es el que contiene la fecha elegida.
  const trimestreFecha = useMemo(() => trimestrePorFecha(periodos, fecha), [periodos, fecha]);

  const paralelosDelCurso = useMemo(() => parallels.filter((p) => p.course_id === courseId), [parallels, courseId]);

  const cargarEstudiantesYSesion = async () => {
    setEstados({});
    setGuardados({});
    setEditables(new Set());
    setErrorGuardar("");
    setFilaActiva(null);
    setClassSessionId(null);
    setSaved(false);
    if (!courseId || !parallelId) {
      setStudents([]);
      return;
    }
    const { data: est } = await supabase
      .from("students")
      .select("*")
      .eq("course_id", courseId)
      .eq("parallel_id", parallelId)
      .eq("active", true)
      .order("last_name");
    setStudents(est || []);

    if (!subjectId) return;
    const { data: sesion } = await supabase
      .from("class_sessions")
      .select("*")
      .eq("subject_id", subjectId)
      .eq("course_id", courseId)
      .eq("parallel_id", parallelId)
      .eq("class_date", fecha)
      .maybeSingle();

    if (sesion) {
      setClassSessionId(sesion.id);
      const { data: marcas } = await supabase.from("attendance").select("*").eq("class_session_id", sesion.id);
      const mapa = {};
      (marcas || []).forEach((m) => { mapa[m.student_id] = m.status; });
      setEstados(mapa);
      setGuardados({ ...mapa });
    }
  };

  useEffect(() => {
    cargarEstudiantesYSesion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, courseId, parallelId, fecha]);

  // Una fila está bloqueada si su asistencia ya fue guardada y no se habilitó su edición.
  // Los alumnos sin asistencia guardada se marcan con un solo clic, como siempre.
  const filaBloqueada = (studentId) => guardados[studentId] !== undefined && !editables.has(studentId);

  const marcar = (studentId, key) => {
    setFilaActiva(studentId);
    if (filaBloqueada(studentId)) return;
    setEstados((prev) => ({ ...prev, [studentId]: key }));
    setSaved(false);
  };

  const marcarTodosPresentes = () => {
    setEstados((prev) => {
      const next = { ...prev };
      students.forEach((s) => { if (!filaBloqueada(s.id)) next[s.id] = "present"; });
      return next;
    });
    setSaved(false);
  };

  // Doble clic sobre la fila de un alumno con asistencia guardada: habilita solo a ese alumno.
  const habilitarEdicion = (ev, studentId) => {
    setFilaActiva(studentId);
    if (guardados[studentId] === undefined) return;
    if (ev.target.closest && ev.target.closest("[data-estados]")) return; // dobles clics al marcar no cuentan
    setEditables((prev) => new Set(prev).add(studentId));
  };

  const guardar = async () => {
    if (!subjectId || !courseId || !parallelId) return;
    setGuardando(true);

    let sesionId = classSessionId;
    if (!sesionId) {
      const { data: nuevaSesion, error: errSesion } = await supabase
        .from("class_sessions")
        .insert({
          subject_id: subjectId, teacher_id: user.id, course_id: courseId, parallel_id: parallelId, class_date: fecha,
          ...(sesionTieneTrimestre && trimestreFecha ? { academic_period_id: trimestreFecha.id } : {}),
        })
        .select()
        .single();
      if (errSesion) {
        setGuardando(false);
        setErrorGuardar("No se pudo crear la sesión de clase: " + errSesion.message);
        return;
      }
      sesionId = nuevaSesion.id;
      setClassSessionId(sesionId);
    }

    const registros = Object.entries(estados).map(([studentId, status]) => ({
      class_session_id: sesionId,
      student_id: studentId,
      status,
      registered_by: user.id,
    }));

    if (registros.length > 0) {
      const { error } = await supabase.from("attendance").upsert(registros, { onConflict: "class_session_id,student_id" });
      if (error) {
        setGuardando(false);
        setErrorGuardar("No se pudo guardar la asistencia: " + error.message);
        return;
      }
    }
    setErrorGuardar("");
    setGuardados({ ...estados }); // lo guardado vuelve a quedar bloqueado
    setEditables(new Set());
    setGuardando(false);
    setSaved(true);
  };

  const nombreMateria = subjects.find((s) => s.id === subjectId)?.name || "";
  const nombreCurso = courses.find((c) => c.id === courseId)?.name || "";
  const nombreParalelo = parallels.find((p) => p.id === parallelId)?.name || "";

  const contextoDia = () => ({
    estudiantes: students,
    estados,
    institucion: institutionName,
    materia: nombreMateria,
    curso: nombreCurso,
    paralelo: nombreParalelo,
    fecha,
  });

  // Trae todas las sesiones del mes de la fecha elegida y arma la matriz
  // alumno × día que consumen los reportes mensuales.
  const generarDatosMes = async () => {
    const inicio = `${fecha.slice(0, 7)}-01`;
    const ultimoDia = new Date(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)), 0).getDate();
    const fin = `${fecha.slice(0, 7)}-${String(ultimoDia).padStart(2, "0")}`;

    let q = supabase
      .from("class_sessions")
      .select("id, class_date")
      .eq("course_id", courseId)
      .eq("parallel_id", parallelId)
      .gte("class_date", inicio)
      .lte("class_date", fin);
    if (subjectId) q = q.eq("subject_id", subjectId);

    const { data: sesiones } = await q;
    if (!sesiones || sesiones.length === 0) return null;

    const { data: marcas } = await supabase
      .from("attendance")
      .select("class_session_id, student_id, status")
      .in("class_session_id", sesiones.map((s) => s.id));

    const fechaPorSesion = {};
    sesiones.forEach((s) => { fechaPorSesion[s.id] = s.class_date; });

    const porEstudianteYDia = {};
    (marcas || []).forEach((m) => {
      const dia = fechaPorSesion[m.class_session_id];
      if (!dia) return;
      if (!porEstudianteYDia[m.student_id]) porEstudianteYDia[m.student_id] = {};
      porEstudianteYDia[m.student_id][dia] = m.status;
    });

    const dias = [...new Set(sesiones.map((s) => s.class_date))].sort();
    const mesLegible = new Date(`${inicio}T12:00:00`).toLocaleDateString("es-BO", {
      month: "long", year: "numeric",
    });

    return {
      estudiantes: students,
      porEstudianteYDia,
      dias,
      institucion: institutionName,
      curso: nombreCurso,
      paralelo: nombreParalelo,
      mesLegible,
    };
  };

  const exportarMes = async (formato) => {
    setGenerandoMes(true);
    setAvisoMes("");
    const datos = await generarDatosMes();
    setGenerandoMes(false);
    if (!datos) {
      setAvisoMes("No hay asistencias registradas en este mes para el curso y paralelo seleccionados.");
      return;
    }
    if (formato === "pdf") exportarAsistenciaMesPdf(datos);
    else exportarAsistenciaMesExcel(datos);
  };

  return (
    <div className="p-4 md:p-8 space-y-5">
      <div className="bg-white border border-slate-200 rounded p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Materia</label>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="">Selecciona…</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Curso</label>
          <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setParallelId(""); }} className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="">Selecciona…</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Paralelo</label>
          <select value={parallelId} onChange={(e) => setParallelId(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="">Selecciona…</option>
            {paralelosDelCurso.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {trimestreFecha ? (
          <>
            <span className="text-slate-500">Trimestre de esta fecha:</span>
            <span className="font-medium text-slate-800">{trimestreFecha.name}</span>
            {trimestreFecha.active && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">Vigente</span>
            )}
          </>
        ) : (
          periodos.length > 0 && <span className="text-amber-700">La fecha elegida no pertenece a ningún trimestre registrado.</span>
        )}
        {avisoTrimestres && <span className="text-amber-700">{avisoTrimestres}</span>}
      </div>

      {courseId && parallelId && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {students.length} estudiantes
              {Object.keys(guardados).length > 0 && (
                <span className="ml-3 text-xs text-slate-400">
                  Las asistencias guardadas están bloqueadas: doble clic en la fila del alumno para modificarlas.
                </span>
              )}
            </p>
            <button onClick={marcarTodosPresentes} className="text-xs text-emerald-700 hover:underline">Marcar todos presentes</button>
          </div>

          <div className="bg-white border border-slate-200 rounded p-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500 mr-1">Reportes:</span>            <button
              onClick={() => exportarAsistenciaDiaPdf(contextoDia())}
              disabled={students.length === 0}
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <FileText className="h-3.5 w-3.5" /> Día · PDF
            </button>
            <button
              onClick={() => exportarAsistenciaDiaExcel(contextoDia())}
              disabled={students.length === 0}
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <FileDown className="h-3.5 w-3.5" /> Día · Excel
            </button>

            <span className="mx-1 h-4 w-px bg-slate-200" />

            <button
              onClick={() => exportarMes("pdf")}
              disabled={generandoMes || students.length === 0}
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <CalendarRange className="h-3.5 w-3.5" /> Mes · PDF
            </button>
            <button
              onClick={() => exportarMes("excel")}
              disabled={generandoMes || students.length === 0}
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <CalendarRange className="h-3.5 w-3.5" /> Mes · Excel
            </button>

            <span className="mx-1 h-4 w-px bg-slate-200" />

            <button
              onClick={() => setShowHistorial(true)}
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <History className="h-3.5 w-3.5" /> Ver / editar historial
            </button>

            {generandoMes && <span className="text-xs text-slate-400">Generando…</span>}
            {avisoMes && <span className="text-xs text-amber-700 w-full">{avisoMes}</span>}
          </div>

          <div className="bg-white border border-slate-200 rounded divide-y divide-slate-100">
            {students.map((s) => {
              const bloqueada = filaBloqueada(s.id);
              const editando = guardados[s.id] !== undefined && editables.has(s.id);
              const activa = filaActiva === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => setFilaActiva(s.id)}
                  onFocus={() => setFilaActiva(s.id)}
                  onDoubleClick={(ev) => habilitarEdicion(ev, s.id)}
                  title={bloqueada ? "Asistencia guardada. Doble clic para editarla." : undefined}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between select-none border-l-4 transition-colors ${
                    activa ? "bg-pink-200 border-l-pink-600" : editando ? "bg-pink-100 border-l-pink-500" : "border-l-transparent hover:bg-pink-100"
                  }`}
                >
                  <div>
                    <p className={`text-sm text-slate-800 flex items-center gap-2 ${activa ? "font-semibold" : ""}`}>
                      {s.first_name} {s.last_name}
                      {bloqueada && <Lock className="h-3 w-3 text-slate-400" aria-label="Asistencia bloqueada" />}
                      {editando && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-pink-300 bg-white px-2 py-0.5 text-[10px] font-medium text-pink-700">
                          <Pencil className="h-2.5 w-2.5" /> Editando
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">{s.student_code || "s/código"}</p>
                  </div>
                  <div data-estados className={`flex flex-wrap gap-2 ${bloqueada ? "pointer-events-none" : ""}`} aria-disabled={bloqueada}>
                    {ESTADOS_ASISTENCIA.map((e) => (
                      <StatusPill key={e.key} estadoKey={e.key} selected={estados[s.id] === e.key} onClick={() => marcar(s.id, e.key)} />
                    ))}
                  </div>
                </div>
              );
            })}
            {students.length === 0 && <p className="p-6 text-sm text-slate-400 text-center">No hay estudiantes activos en este curso y paralelo.</p>}
          </div>

          <div className="flex items-center justify-end gap-3">
            {errorGuardar && <span className="text-xs text-red-700">{errorGuardar}</span>}
            {saved && <span className="text-xs text-emerald-700 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Asistencia guardada</span>}
            <button
              onClick={guardar}
              disabled={!subjectId || guardando}
              className="inline-flex items-center gap-2 rounded bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar asistencia"}
            </button>
          </div>
          {!subjectId && <p className="text-xs text-amber-700">Selecciona una materia para poder guardar.</p>}
        </>
      )}

      {showHistorial && courseId && parallelId && (
        <HistorialAsistenciaModal
          courseId={courseId}
          parallelId={parallelId}
          subjectId={subjectId}
          subjects={subjects}
          onClose={() => setShowHistorial(false)}
          onChanged={cargarEstudiantesYSesion}
        />
      )}
    </div>
  );
}
