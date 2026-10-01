import { useEffect, useMemo, useState, useRef } from "react";
import { Plus, Check, FileSpreadsheet, Upload, AlertTriangle, Download, Pencil, FileUp } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { Field, Modal } from "../components/ui";
import { leerArchivoNotas, generarPlantillaNotas } from "../lib/importNotas";
import { leerLibroPlanilla, parsearPlanillaCompleta, normalizarNombre } from "../lib/importPlanilla";

const DIMENSIONES = [
  { key: "ser", label: "SER", max: 10 },
  { key: "saber", label: "SABER", max: 45 },
  { key: "hacer", label: "HACER", max: 40 },
  { key: "autoevaluacion", label: "Autoevaluación", max: 5 },
];
const DIMENSION_MAX = { ser: 10, saber: 45, hacer: 40, autoevaluacion: 5 };

export default function Notas() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [courses, setCourses] = useState([]);
  const [parallels, setParallels] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [students, setStudents] = useState([]);

  const [subjectId, setSubjectId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [parallelId, setParallelId] = useState("");

  const [dimensionActiva, setDimensionActiva] = useState("ser");
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [evaluacionId, setEvaluacionId] = useState("");
  const [edicionesPendientes, setEdicionesPendientes] = useState({}); // `${evaluationId}:${studentId}` -> valor en edición
  const [notasTodas, setNotasTodas] = useState([]);

  const [showEvalModal, setShowEvalModal] = useState(false);
  const [evaluacionEditando, setEvaluacionEditando] = useState(null);
  const [showImportarNotas, setShowImportarNotas] = useState(false);
  const [showImportarPlanilla, setShowImportarPlanilla] = useState(false);
  const [saved, setSaved] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    async function cargarBase() {
      const [{ data: subj }, { data: cur }, { data: par }, { data: tip }] = await Promise.all([
        supabase.from("subjects").select("*").eq("active", true).order("name"),
        supabase.from("courses").select("*").eq("active", true).order("name"),
        supabase.from("parallels").select("*").eq("active", true).order("name"),
        supabase.from("evaluation_types").select("*").eq("active", true).order("name"),
      ]);
      setSubjects(subj || []);
      setCourses(cur || []);
      setParallels(par || []);
      setTipos(tip || []);
    }
    cargarBase();
  }, []);

  const paralelosDelCurso = useMemo(() => parallels.filter((p) => p.course_id === courseId), [parallels, courseId]);

  useEffect(() => {
    async function cargarEstudiantes() {
      if (!courseId || !parallelId) { setStudents([]); return; }
      const { data } = await supabase
        .from("students").select("*").eq("course_id", courseId).eq("parallel_id", parallelId).eq("active", true).order("last_name");
      setStudents(data || []);
    }
    cargarEstudiantes();
  }, [courseId, parallelId]);

  async function cargarEvaluaciones() {
    if (!subjectId || !courseId || !parallelId) { setEvaluaciones([]); setNotasTodas([]); return; }
    const { data } = await supabase
      .from("evaluations").select("*")
      .eq("subject_id", subjectId).eq("course_id", courseId).eq("parallel_id", parallelId)
      .order("evaluation_date", { ascending: false });
    setEvaluaciones(data || []);
    if (data && data.length > 0) {
      const { data: todasNotas } = await supabase.from("grades").select("*").in("evaluation_id", data.map((e) => e.id));
      setNotasTodas(todasNotas || []);
    } else {
      setNotasTodas([]);
    }
  }

  useEffect(() => {
    cargarEvaluaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, courseId, parallelId]);

  const evaluacionesDimension = useMemo(
    () => evaluaciones.filter((e) => (e.dimension || "hacer") === dimensionActiva),
    [evaluaciones, dimensionActiva]
  );

  useEffect(() => {
    if (evaluacionesDimension.length > 0) {
      if (!evaluacionesDimension.find((e) => e.id === evaluacionId)) setEvaluacionId(evaluacionesDimension[0].id);
    } else {
      setEvaluacionId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensionActiva, evaluaciones]);

  const evaluacionActual = evaluaciones.find((e) => e.id === evaluacionId);

  // Valor que debe mostrarse en una celda de la grilla: lo que el profesor
  // está editando ahora mismo (si lo hay), o si no, lo que ya está guardado.
  function valorCelda(evaluationId, studentId) {
    const clave = `${evaluationId}:${studentId}`;
    if (clave in edicionesPendientes) return edicionesPendientes[clave];
    const nota = notasTodas.find((n) => n.evaluation_id === evaluationId && n.student_id === studentId);
    return nota?.score ?? "";
  }

  function editarCelda(evaluationId, studentId, valor) {
    setEdicionesPendientes((prev) => ({ ...prev, [`${evaluationId}:${studentId}`]: valor }));
    setSaved(false);
  }

  function promedioDimension(studentId, dimensionKey) {
    const evalsDeLaDimension = evaluaciones.filter((e) => (e.dimension || "hacer") === dimensionKey);
    const notasDelAlumno = evalsDeLaDimension
      .map((ev) => notasTodas.find((n) => n.student_id === studentId && n.evaluation_id === ev.id))
      .filter((n) => n && n.score !== null && n.score !== undefined);
    if (notasDelAlumno.length === 0) return null;
    const suma = notasDelAlumno.reduce((acc, n) => acc + Number(n.score), 0);
    return suma / notasDelAlumno.length;
  }

  function totalMaestro(studentId) {
    return ["ser", "saber", "hacer"].reduce((acc, key) => acc + (promedioDimension(studentId, key) ?? 0), 0);
  }

  function calificacionTrimestral(studentId) {
    return totalMaestro(studentId) + (promedioDimension(studentId, "autoevaluacion") ?? 0);
  }

  const guardarGridNotas = async () => {
    const idsDimension = new Set(evaluacionesDimension.map((e) => e.id));
    const claves = Object.keys(edicionesPendientes).filter((k) => idsDimension.has(k.split(":")[0]));
    if (claves.length === 0) return;
    setGuardando(true);
    const registros = claves
      .filter((k) => edicionesPendientes[k] !== "" && edicionesPendientes[k] !== null)
      .map((k) => {
        const [evaluationId, studentId] = k.split(":");
        return {
          evaluation_id: evaluationId, student_id: studentId, score: Number(edicionesPendientes[k]),
          registered_by: user.id, updated_at: new Date().toISOString(),
        };
      });
    if (registros.length > 0) {
      await supabase.from("grades").upsert(registros, { onConflict: "evaluation_id,student_id" });
    }
    await cargarEvaluaciones();
    setEdicionesPendientes((prev) => {
      const copia = { ...prev };
      claves.forEach((k) => delete copia[k]);
      return copia;
    });
    setGuardando(false);
    setSaved(true);
  };

  const guardarEvaluacion = async ({ id, titulo, evaluationTypeId, fecha, puntajeMax, dimension }) => {
    if (id) {
      const { error } = await supabase.from("evaluations").update({
        title: titulo, evaluation_type_id: evaluationTypeId || null, evaluation_date: fecha,
        maximum_score: puntajeMax, dimension,
      }).eq("id", id);
      if (!error) {
        setShowEvalModal(false);
        setEvaluacionEditando(null);
        setDimensionActiva(dimension);
        await cargarEvaluaciones();
        setEvaluacionId(id);
      }
    } else {
      const { data, error } = await supabase.from("evaluations").insert({
        subject_id: subjectId, teacher_id: user.id, course_id: courseId, parallel_id: parallelId,
        evaluation_type_id: evaluationTypeId || null, title: titulo, evaluation_date: fecha,
        maximum_score: puntajeMax, dimension,
      }).select().single();
      if (!error) {
        setShowEvalModal(false);
        setDimensionActiva(dimension);
        await cargarEvaluaciones();
        setEvaluacionId(data.id);
      }
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-5">
      <div className="bg-white border border-slate-200 rounded p-4 grid grid-cols-3 gap-3">
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
      </div>

      {subjectId && courseId && parallelId && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {DIMENSIONES.map((d) => (
                <button
                  key={d.key}
                  onClick={() => setDimensionActiva(d.key)}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                    dimensionActiva === d.key
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"
                  }`}
                >
                  {d.label} <span className="opacity-60">/{d.max}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowImportarPlanilla(true)}
              className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <FileUp className="h-3.5 w-3.5" /> Importar planilla completa (SER/SABER/HACER)
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-slate-500">
                Criterios de {DIMENSIONES.find((d) => d.key === dimensionActiva)?.label}
                {evaluacionActual && <span className="text-slate-400"> · seleccionado para importar: {evaluacionActual.title}</span>}
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowImportarNotas(true)}
                  disabled={!evaluacionActual}
                  className="inline-flex items-center gap-1 text-xs text-slate-600 hover:underline disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Importar notas de 1 criterio
                </button>
                <button
                  onClick={() => { setEvaluacionEditando(null); setShowEvalModal(true); }}
                  className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Nueva evaluación
                </button>
              </div>
            </div>

            {evaluacionesDimension.length > 0 ? (
              <>
                <div className="bg-white border border-slate-200 rounded overflow-x-auto">
                  <table className="text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs text-slate-500">
                        <th className="px-4 py-2 font-medium text-left sticky left-0 bg-white z-10 whitespace-nowrap">Estudiante</th>
                        {evaluacionesDimension.map((e) => (
                          <th
                            key={e.id}
                            onClick={() => setEvaluacionId(e.id)}
                            title={e.title}
                            className={`px-1.5 py-2 font-medium text-center align-bottom cursor-pointer select-none ${evaluacionId === e.id ? "bg-emerald-50" : ""}`}
                            style={{ minWidth: 86, maxWidth: 110 }}
                          >
                            <div className="flex items-start justify-center gap-1">
                              <span className="line-clamp-2 leading-tight text-[11px] normal-case font-normal text-slate-700">{e.title}</span>
                              <button
                                onClick={(ev) => { ev.stopPropagation(); setEvaluacionEditando(e); setShowEvalModal(true); }}
                                className="text-slate-300 hover:text-slate-600 shrink-0"
                                title="Editar criterio"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </div>
                            <p className="text-[10px] text-slate-400 font-normal mt-0.5">/{e.maximum_score}</p>
                          </th>
                        ))}
                        <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Promedio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {students.map((s) => {
                        const prom = promedioDimension(s.id, dimensionActiva);
                        return (
                          <tr key={s.id}>
                            <td className="px-4 py-1.5 text-slate-800 whitespace-nowrap sticky left-0 bg-white z-10">{s.first_name} {s.last_name}</td>
                            {evaluacionesDimension.map((e) => (
                              <td key={e.id} className="px-1 py-1.5 text-center">
                                <input
                                  type="number" min="0" max={e.maximum_score}
                                  value={valorCelda(e.id, s.id)}
                                  onChange={(ev) => editarCelda(e.id, s.id, ev.target.value)}
                                  className="w-16 rounded border border-slate-300 px-1 py-1 text-xs text-center"
                                  placeholder="—"
                                />
                              </td>
                            ))}
                            <td className="px-4 py-1.5 text-right text-slate-700 font-medium whitespace-nowrap">{prom !== null ? prom.toFixed(1) : "—"}</td>
                          </tr>
                        );
                      })}
                      {students.length === 0 && (
                        <tr><td colSpan={evaluacionesDimension.length + 2} className="p-6 text-sm text-slate-400 text-center">No hay estudiantes activos en este curso y paralelo.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-end gap-3">
                  {saved && <span className="text-xs text-emerald-700 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Notas guardadas</span>}
                  <button onClick={guardarGridNotas} disabled={guardando} className="inline-flex items-center gap-2 rounded bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                    {guardando ? "Guardando…" : "Guardar notas"}
                  </button>
                </div>
              </>
            ) : (
              <div className="bg-white border border-slate-200 rounded p-8 text-center text-sm text-slate-400">
                Crea una evaluación en esta dimensión para empezar a registrar notas.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs text-slate-500">Registro de calificaciones</p>
            <div className="bg-white border border-slate-200 rounded overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="px-4 py-3 font-medium">Estudiante</th>
                    <th className="px-4 py-3 font-medium text-right">SER /10</th>
                    <th className="px-4 py-3 font-medium text-right">SABER /45</th>
                    <th className="px-4 py-3 font-medium text-right">HACER /40</th>
                    <th className="px-4 py-3 font-medium text-right">TOTAL /95</th>
                    <th className="px-4 py-3 font-medium text-right">Autoeval. /5</th>
                    <th className="px-4 py-3 font-medium text-right">Calif. trimestral /100</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((s) => {
                    const ser = promedioDimension(s.id, "ser");
                    const saber = promedioDimension(s.id, "saber");
                    const hacer = promedioDimension(s.id, "hacer");
                    const autoeval = promedioDimension(s.id, "autoevaluacion");
                    return (
                      <tr key={s.id}>
                        <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{s.first_name} {s.last_name}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{ser !== null ? ser.toFixed(1) : "—"}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{saber !== null ? saber.toFixed(1) : "—"}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{hacer !== null ? hacer.toFixed(1) : "—"}</td>
                        <td className="px-4 py-3 text-right text-slate-700 font-medium">{totalMaestro(s.id).toFixed(1)}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{autoeval !== null ? autoeval.toFixed(1) : "—"}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{calificacionTrimestral(s.id).toFixed(1)}</td>
                      </tr>
                    );
                  })}
                  {students.length === 0 && (
                    <tr><td colSpan={7} className="p-6 text-sm text-slate-400 text-center">Sin estudiantes.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showEvalModal && (
        <EvaluacionModal
          tipos={tipos}
          evaluacion={evaluacionEditando}
          dimensionPorDefecto={dimensionActiva}
          onClose={() => { setShowEvalModal(false); setEvaluacionEditando(null); }}
          onSave={guardarEvaluacion}
        />
      )}
      {showImportarNotas && evaluacionActual && (
        <ImportarNotasModal
          evaluacion={evaluacionActual}
          students={students}
          onClose={() => setShowImportarNotas(false)}
          onImported={async () => {
            setShowImportarNotas(false);
            await cargarEvaluaciones();
            setSaved(true);
          }}
        />
      )}
      {showImportarPlanilla && (
        <ImportarPlanillaModal
          subjectId={subjectId}
          courseId={courseId}
          parallelId={parallelId}
          students={students}
          evaluaciones={evaluaciones}
          onClose={() => setShowImportarPlanilla(false)}
          onImported={async () => {
            setShowImportarPlanilla(false);
            await cargarEvaluaciones();
            setSaved(true);
          }}
        />
      )}
    </div>
  );
}

function EvaluacionModal({ tipos, evaluacion, dimensionPorDefecto, onClose, onSave }) {
  const [titulo, setTitulo] = useState(evaluacion?.title || "");
  const [evaluationTypeId, setEvaluationTypeId] = useState(evaluacion?.evaluation_type_id || tipos[0]?.id || "");
  const [fecha, setFecha] = useState(evaluacion?.evaluation_date || new Date().toISOString().slice(0, 10));
  const [puntajeMax, setPuntajeMax] = useState(evaluacion?.maximum_score ?? 10);
  const [dimension, setDimension] = useState(evaluacion?.dimension || dimensionPorDefecto);

  const guardar = () => {
    if (!titulo.trim()) return;
    onSave({ id: evaluacion?.id, titulo: titulo.trim(), evaluationTypeId, fecha, puntajeMax: Number(puntajeMax), dimension });
  };

  return (
    <Modal title={evaluacion ? "Editar evaluación" : "Nueva evaluación"} onClose={onClose} maxWidth="sm:max-w-md"
      footer={
        <>
          <button onClick={onClose} className="text-sm text-slate-600 px-4 py-2">Cancelar</button>
          <button onClick={guardar} className="text-sm bg-slate-900 text-white px-4 py-2 rounded hover:bg-slate-800">
            {evaluacion ? "Guardar cambios" : "Crear evaluación"}
          </button>
        </>
      }
    >
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Dimensión</label>
        <select value={dimension} onChange={(e) => setDimension(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
          {DIMENSIONES.map((d) => <option key={d.key} value={d.key}>{d.label} (/{d.max})</option>)}
        </select>
      </div>
      <Field label="Título" value={titulo} onChange={setTitulo} placeholder="Ej. Prueba del segundo bimestre" required />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Tipo</label>
          <select value={evaluationTypeId} onChange={(e) => setEvaluationTypeId(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <Field label="Fecha" type="date" value={fecha} onChange={setFecha} />
      </div>
      <Field label="Puntaje máximo" type="number" value={puntajeMax} onChange={setPuntajeMax} />
    </Modal>
  );
}

function ImportarNotasModal({ evaluacion, students, onClose, onImported }) {
  const { user } = useAuth();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [importando, setImportando] = useState(false);
  const inputRef = useRef(null);

  const buscarAlumno = (codigo) =>
    students.find((s) => (s.student_code || "").trim().toLowerCase() === codigo.trim().toLowerCase());

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setFileName(file.name);
    try {
      const registros = await leerArchivoNotas(file);
      if (registros.length === 0) {
        setError("El archivo no tiene filas de datos.");
        setRows([]);
        return;
      }
      const procesadas = registros.map((r) => {
        const problemas = [];
        const alumno = r.codigo ? buscarAlumno(r.codigo) : null;
        if (!r.codigo) problemas.push("Falta código");
        else if (!alumno) problemas.push("Código no encontrado en este curso/paralelo");

        const notaNum = Number(r.nota);
        if (r.nota === "") problemas.push("Falta nota");
        else if (Number.isNaN(notaNum)) problemas.push("La nota no es un número");
        else if (notaNum < 0 || notaNum > Number(evaluacion.maximum_score)) problemas.push(`Debe estar entre 0 y ${evaluacion.maximum_score}`);

        return { ...r, alumno, notaNum, valido: problemas.length === 0, problemas };
      });
      setRows(procesadas);
    } catch (err) {
      setError("No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) o CSV válido.");
      setRows([]);
    }
  };

  const validas = rows.filter((r) => r.valido);
  const conError = rows.filter((r) => !r.valido);

  const confirmar = async () => {
    setImportando(true);
    const registros = validas.map((r) => ({
      evaluation_id: evaluacion.id,
      student_id: r.alumno.id,
      score: r.notaNum,
      registered_by: user.id,
      updated_at: new Date().toISOString(),
    }));
    const { error: err } = await supabase.from("grades").upsert(registros, { onConflict: "evaluation_id,student_id" });
    setImportando(false);
    if (err) setError(err.message);
    else onImported();
  };

  return (
    <Modal
      title={`Importar notas — ${evaluacion.title}`}
      onClose={onClose}
      maxWidth="sm:max-w-2xl"
      footer={
        <>
          <button onClick={onClose} className="text-sm text-slate-600 px-4 py-2">Cancelar</button>
          <button
            onClick={confirmar}
            disabled={validas.length === 0 || importando}
            className="text-sm bg-slate-900 text-white px-4 py-2 rounded hover:bg-slate-800 disabled:opacity-40"
          >
            {importando ? "Importando…" : `Confirmar importación (${validas.length})`}
          </button>
        </>
      }
    >
      <p className="text-xs text-slate-500">
        El archivo debe tener las columnas <b>Código</b> y <b>Nota</b>. Solo se importan las notas de
        alumnos que pertenezcan a este curso y paralelo.
      </p>
      <button
        onClick={() => generarPlantillaNotas(students, evaluacion.title)}
        className="inline-flex items-center gap-2 text-xs text-emerald-700 hover:underline"
      >
        <Download className="h-3.5 w-3.5" /> Descargar plantilla con los alumnos de este curso/paralelo
      </button>

      {rows.length === 0 && (
        <>
          <div
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 rounded p-8 text-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/30 transition-colors"
          >
            <Upload className="h-6 w-6 text-slate-400 mx-auto mb-2" />
            <p className="text-sm text-slate-600">{fileName || "Haz clic para seleccionar el archivo de notas (.xlsx o .csv)"}</p>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
          </div>
          {error && <p className="text-sm text-red-700 flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> {error}</p>}
        </>
      )}

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{validas.length} listas</span>
            <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">{conError.length} con errores</span>
            <button onClick={() => { setRows([]); setFileName(""); }} className="ml-auto text-xs text-slate-500 hover:underline">Elegir otro archivo</button>
          </div>
          <div className="border border-slate-200 rounded overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Fila</th>
                  <th className="px-3 py-2 text-left font-medium">Código</th>
                  <th className="px-3 py-2 text-left font-medium">Alumno</th>
                  <th className="px-3 py-2 text-left font-medium">Nota</th>
                  <th className="px-3 py-2 text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={i} className={r.valido ? "" : "bg-red-50/40"}>
                    <td className="px-3 py-2 text-slate-500">{r.fila}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.codigo || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.alumno ? `${r.alumno.first_name} ${r.alumno.last_name}` : "—"}</td>
                    <td className="px-3 py-2">{r.nota || "—"}</td>
                    <td className="px-3 py-2">
                      {r.valido ? (
                        <span className="text-emerald-700 flex items-center gap-1 whitespace-nowrap"><Check className="h-3.5 w-3.5" /> Válido</span>
                      ) : (
                        <span className="text-red-700">{r.problemas.join(" · ")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

function ImportarPlanillaModal({ subjectId, courseId, parallelId, students, evaluaciones, onClose, onImported }) {
  const { user } = useAuth();
  const [fileName, setFileName] = useState("");
  const [workbook, setWorkbook] = useState(null);
  const [hojas, setHojas] = useState([]);
  const [hojaElegida, setHojaElegida] = useState("");
  const [resultado, setResultado] = useState(null); // salida de parsearPlanillaCompleta
  const [error, setError] = useState("");
  const [importando, setImportando] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [coincidenciasManuales, setCoincidenciasManuales] = useState({}); // { indiceFila: studentId }
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setResultado(null);
    setFileName(file.name);
    try {
      const { workbook: wb, hojas: encontradas } = await leerLibroPlanilla(file);
      if (encontradas.length === 0) {
        setError('No se encontró ninguna hoja de trimestre (se busca un nombre tipo "REG1erTRIM", "REG2doTRIM", etc.) en este archivo.');
        return;
      }
      setWorkbook(wb);
      setHojas(encontradas);
      if (encontradas.length === 1) {
        analizarHoja(wb, encontradas[0]);
      }
    } catch (err) {
      setError("No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) válido.");
    }
  };

  const analizarHoja = (wb, nombreHoja) => {
    setHojaElegida(nombreHoja);
    const sheet = wb.Sheets[nombreHoja];
    const parsed = parsearPlanillaCompleta(sheet);
    if (!parsed) {
      setError(`No se reconoció el formato dentro de la hoja "${nombreHoja}".`);
      return;
    }
    setResultado(parsed);
  };

  // Cruce de alumnos del archivo contra los alumnos ya registrados en este curso/paralelo.
  // Si no hubo coincidencia automática por nombre, se usa la que el profesor eligió a mano.
  const alumnosCruzados = useMemo(() => {
    if (!resultado) return [];
    return resultado.alumnos.map((a, i) => {
      const objetivo = normalizarNombre(a.nombreCompleto);
      const automatico = students.find((s) => normalizarNombre(`${s.last_name} ${s.first_name}`) === objetivo);
      const manual = !automatico && coincidenciasManuales[i] ? students.find((s) => s.id === coincidenciasManuales[i]) : null;
      return { ...a, alumnoDB: automatico || manual || null, coincidenciaManual: !automatico && !!manual };
    });
  }, [resultado, students, coincidenciasManuales]);

  const totalCriterios = resultado
    ? resultado.criterios.ser.length + resultado.criterios.saber.length + resultado.criterios.hacer.length
    : 0;
  const criteriosNuevos = (dim) => {
    if (!resultado) return 0;
    const existentes = new Set(
      evaluaciones.filter((e) => (e.dimension || "hacer") === dim).map((e) => e.title.trim().toLowerCase())
    );
    return resultado.criterios[dim].filter((c) => !existentes.has(c.titulo.trim().toLowerCase())).length;
  };

  const encontrados = alumnosCruzados.filter((a) => a.alumnoDB).length;
  const noEncontrados = alumnosCruzados.length - encontrados;

  const confirmar = async () => {
    if (!resultado) return;
    setImportando(true);
    setError("");
    try {
      // Paso 1: crear o reutilizar las evaluaciones de cada criterio detectado
      const idsPorDimension = { ser: [], saber: [], hacer: [] };
      for (const dim of ["ser", "saber", "hacer"]) {
        for (const criterio of resultado.criterios[dim]) {
          const existente = evaluaciones.find(
            (e) => (e.dimension || "hacer") === dim && e.title.trim().toLowerCase() === criterio.titulo.trim().toLowerCase()
          );
          if (existente) {
            idsPorDimension[dim].push(existente.id);
          } else {
            const { data, error: errIns } = await supabase.from("evaluations").insert({
              subject_id: subjectId, teacher_id: user.id, course_id: courseId, parallel_id: parallelId,
              dimension: dim, title: criterio.titulo, evaluation_date: new Date().toISOString().slice(0, 10),
              maximum_score: DIMENSION_MAX[dim],
            }).select().single();
            if (errIns) throw errIns;
            idsPorDimension[dim].push(data.id);
            evaluaciones.push(data); // para que futuras vueltas del loop lo detecten como existente
          }
        }
      }

      // Paso 2: autoevaluación (una sola evaluación reutilizable)
      const hayAutoeval = alumnosCruzados.some((a) => a.valores.autoeval !== null);
      let autoevalId = null;
      if (hayAutoeval) {
        const existente = evaluaciones.find((e) => (e.dimension || "hacer") === "autoevaluacion");
        if (existente) {
          autoevalId = existente.id;
        } else {
          const { data, error: errIns } = await supabase.from("evaluations").insert({
            subject_id: subjectId, teacher_id: user.id, course_id: courseId, parallel_id: parallelId,
            dimension: "autoevaluacion", title: "Autoevaluación", evaluation_date: new Date().toISOString().slice(0, 10),
            maximum_score: DIMENSION_MAX.autoevaluacion,
          }).select().single();
          if (errIns) throw errIns;
          autoevalId = data.id;
        }
      }

      // Paso 3: armar todas las notas a guardar
      const registros = [];
      for (const a of alumnosCruzados) {
        if (!a.alumnoDB) continue;
        for (const dim of ["ser", "saber", "hacer"]) {
          a.valores[dim].forEach((valor, idx) => {
            if (valor === null) return;
            registros.push({
              evaluation_id: idsPorDimension[dim][idx],
              student_id: a.alumnoDB.id,
              score: valor,
              registered_by: user.id,
              updated_at: new Date().toISOString(),
            });
          });
        }
        if (autoevalId && a.valores.autoeval !== null) {
          registros.push({
            evaluation_id: autoevalId,
            student_id: a.alumnoDB.id,
            score: a.valores.autoeval,
            registered_by: user.id,
            updated_at: new Date().toISOString(),
          });
        }
      }

      if (registros.length > 0) {
        const { error: errUp } = await supabase.from("grades").upsert(registros, { onConflict: "evaluation_id,student_id" });
        if (errUp) throw errUp;
      }

      setResumen({ criterios: totalCriterios, notas: registros.length, alumnos: encontrados });
      setImportando(false);
      await onImported();
    } catch (err) {
      setImportando(false);
      setError(err.message || "Ocurrió un error al importar.");
    }
  };

  return (
    <Modal
      title="Importar planilla completa"
      onClose={onClose}
      maxWidth="sm:max-w-3xl"
      footer={
        resultado ? (
          <>
            <button onClick={onClose} className="text-sm text-slate-600 px-4 py-2">Cerrar</button>
            <button
              onClick={confirmar}
              disabled={importando || encontrados === 0}
              className="text-sm bg-slate-900 text-white px-4 py-2 rounded hover:bg-slate-800 disabled:opacity-40"
            >
              {importando ? "Importando…" : `Confirmar importación (${encontrados} alumnos)`}
            </button>
          </>
        ) : (
          <button onClick={onClose} className="text-sm text-slate-600 px-4 py-2">Cerrar</button>
        )
      }
    >
      <p className="text-xs text-slate-500">
        Sube el archivo Excel completo del curso (el mismo que usas para llevar el registro de
        calificaciones). El sistema detecta automáticamente cuántos criterios tiene cada dimensión
        — no importa si varían entre materias o cursos — y crea o reutiliza las evaluaciones
        correspondientes.
      </p>

      {!resultado && !resumen && (
        <>
          <div
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 rounded p-8 text-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/30 transition-colors"
          >
            <Upload className="h-6 w-6 text-slate-400 mx-auto mb-2" />
            <p className="text-sm text-slate-600">{fileName || "Haz clic para seleccionar el archivo Excel del curso"}</p>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
          </div>

          {hojas.length > 1 && !resultado && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">¿Qué trimestre quieres importar?</label>
              <div className="flex flex-wrap gap-2">
                {hojas.map((h) => (
                  <button
                    key={h}
                    onClick={() => analizarHoja(workbook, h)}
                    className={`px-3 py-1.5 rounded-full text-xs border ${hojaElegida === h ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300"}`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-700 flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> {error}</p>}
        </>
      )}

      {resultado && !resumen && (
        <>
          {(resultado.areaDetectada || resultado.cursoDetectado) && (
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded px-3 py-2">
              Detectado en el archivo: <b>{resultado.areaDetectada || "—"}</b> · <b>{resultado.cursoDetectado || "—"}</b>.
              Verifica que coincida con la Materia/Curso/Paralelo que seleccionaste arriba antes de confirmar.
            </p>
          )}

          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="border border-slate-200 rounded p-3">
              <p className="text-slate-500">SER</p>
              <p className="font-ledger text-lg font-semibold text-slate-900">{resultado.criterios.ser.length}</p>
              <p className="text-slate-400">{criteriosNuevos("ser")} nuevo(s)</p>
            </div>
            <div className="border border-slate-200 rounded p-3">
              <p className="text-slate-500">SABER</p>
              <p className="font-ledger text-lg font-semibold text-slate-900">{resultado.criterios.saber.length}</p>
              <p className="text-slate-400">{criteriosNuevos("saber")} nuevo(s)</p>
            </div>
            <div className="border border-slate-200 rounded p-3">
              <p className="text-slate-500">HACER</p>
              <p className="font-ledger text-lg font-semibold text-slate-900">{resultado.criterios.hacer.length}</p>
              <p className="text-slate-400">{criteriosNuevos("hacer")} nuevo(s)</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{encontrados} alumnos encontrados</span>
            {noEncontrados > 0 && <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">{noEncontrados} no encontrados</span>}
            <button onClick={() => { setResultado(null); setFileName(""); setHojas([]); }} className="ml-auto text-xs text-slate-500 hover:underline">Elegir otro archivo</button>
          </div>

          <div className="border border-slate-200 rounded overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Nombre en el archivo</th>
                  <th className="px-3 py-2 text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {alumnosCruzados.map((a, i) => (
                  <tr key={i} className={a.alumnoDB ? "" : "bg-red-50/40"}>
                    <td className="px-3 py-2 whitespace-nowrap">{a.nombreCompleto}</td>
                    <td className="px-3 py-2">
                      {a.alumnoDB ? (
                        <span className={`flex items-center gap-1 whitespace-nowrap ${a.coincidenciaManual ? "text-amber-700" : "text-emerald-700"}`}>
                          <Check className="h-3.5 w-3.5" /> {a.alumnoDB.first_name} {a.alumnoDB.last_name}
                          {a.coincidenciaManual && <span className="text-[10px] text-amber-600">(elegido a mano)</span>}
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-red-700 whitespace-nowrap">No encontrado —</span>
                          <select
                            value=""
                            onChange={(e) => setCoincidenciasManuales((prev) => ({ ...prev, [i]: e.target.value }))}
                            className="rounded border border-slate-300 px-2 py-1 text-xs"
                          >
                            <option value="">Elegir alumno manualmente…</option>
                            {students.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                          </select>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400">
            Si un nombre no coincidió automáticamente, puedes elegir manualmente a qué alumno
            corresponde en el desplegable de su fila — no hace falta corregir el Excel.
          </p>
          {error && <p className="text-sm text-red-700 flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> {error}</p>}
        </>
      )}

      {resumen && (
        <div className="text-center py-6 space-y-2">
          <Check className="h-8 w-8 text-emerald-600 mx-auto" />
          <p className="text-sm text-slate-700">
            Se crearon/actualizaron <b>{resumen.criterios}</b> criterios y se guardaron <b>{resumen.notas}</b> notas
            para <b>{resumen.alumnos}</b> alumnos.
          </p>
        </div>
      )}
    </Modal>
  );
}
