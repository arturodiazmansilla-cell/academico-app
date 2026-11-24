import { useEffect, useMemo, useState, useRef, Fragment } from "react";
import { Plus, Check, FileSpreadsheet, Upload, AlertTriangle, Download, Pencil, FileUp, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { Field, Modal } from "../components/ui";
import { leerArchivoNotas, generarPlantillaNotas } from "../lib/importNotas";
import { leerLibroPlanilla, parsearPlanillaCompleta, normalizarNombre, tituloSinFecha } from "../lib/importPlanilla";

const DIMENSIONES = [
  { key: "ser", label: "SER", max: 10 },
  { key: "saber", label: "SABER", max: 45 },
  { key: "hacer", label: "HACER", max: 40 },
  { key: "autoevaluacion", label: "AUTOEV. DEL ESTUDIANTE", max: 5 },
];
const DIMENSION_MAX = { ser: 10, saber: 45, hacer: 40, autoevaluacion: 5 };

// Mismo orden que el registro en papel: SER, SABER, HACER (evaluación del maestro, /95),
// luego TOTAL, luego Autoevaluación del estudiante (/5), y por último la calificación trimestral.
const DIMENSIONES_MAESTRO = DIMENSIONES.filter((d) => d.key !== "autoevaluacion");
const DIMENSION_AUTOEVAL = DIMENSIONES.find((d) => d.key === "autoevaluacion");

// Color de fondo del encabezado de cada grupo en la tabla combinada (SER/SABER/HACER juntos).
const COLOR_DIMENSION = {
  ser: "bg-indigo-50 text-indigo-800",
  saber: "bg-sky-50 text-sky-800",
  hacer: "bg-amber-50 text-amber-800",
  autoevaluacion: "bg-violet-50 text-violet-800",
};

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
  const [criterioAEliminar, setCriterioAEliminar] = useState(null);
  const [eliminandoCriterio, setEliminandoCriterio] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState("");
  const [showImportarNotas, setShowImportarNotas] = useState(false);
  const [showImportarPlanilla, setShowImportarPlanilla] = useState(false);
  const [saved, setSaved] = useState(false);
  const [popupGuardado, setPopupGuardado] = useState(false);
  const [filaResaltada, setFilaResaltada] = useState(null); // id del alumno con la fila resaltada
  const [guardando, setGuardando] = useState(false);

  // Barra de desplazamiento horizontal superior sincronizada con la tabla de notas.
  // Permite ir y volver de izquierda a derecha sin perder de vista los botones.
  const tablaScrollRef = useRef<HTMLDivElement>(null);
  const barraSupRef = useRef<HTMLDivElement>(null);
  const [anchoBarraSup, setAnchoBarraSup] = useState(0);

  useEffect(() => {
    const tabla = tablaScrollRef.current;
    const barra = barraSupRef.current;
    if (!tabla || !barra) return;
    let sincronizando = false;
    const alMoverTabla = () => {
      if (sincronizando) return;
      sincronizando = true;
      barra.scrollLeft = tabla.scrollLeft;
      sincronizando = false;
    };
    const alMoverBarra = () => {
      if (sincronizando) return;
      sincronizando = true;
      tabla.scrollLeft = barra.scrollLeft;
      sincronizando = false;
    };
    const medir = () => setAnchoBarraSup(tabla.scrollWidth);
    medir();
    const t = setTimeout(medir, 300);
    tabla.addEventListener("scroll", alMoverTabla);
    barra.addEventListener("scroll", alMoverBarra);
    window.addEventListener("resize", medir);
    return () => {
      tabla.removeEventListener("scroll", alMoverTabla);
      barra.removeEventListener("scroll", alMoverBarra);
      window.removeEventListener("resize", medir);
      clearTimeout(t);
    };
  }, [evaluaciones.length, students.length]);

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
      .order("evaluation_date", { ascending: true });
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
    () => evaluaciones.filter((e) => (e.dimension || "hacer") === dimensionActiva).sort(ordenPorFecha),
    [evaluaciones, dimensionActiva]
  );

  // Las mismas evaluaciones, pero agrupadas por las 4 dimensiones a la vez (no solo la
  // activa). Esto es lo que permite mostrar SER + SABER + HACER + Autoevaluación juntos
  // en una sola tabla, sin depender de qué botón esté seleccionado arriba.
  // Se ordenan de la fecha más antigua a la más reciente.
  const evaluacionesPorDimension = useMemo(() => {
    const mapa = {};
    for (const d of DIMENSIONES) {
      mapa[d.key] = evaluaciones.filter((e) => (e.dimension || "hacer") === d.key).sort(ordenPorFecha);
    }
    return mapa;
  }, [evaluaciones]);

  // Conteo de alumnos del curso/paralelo seleccionado, por género.
  const conteoAlumnos = useMemo(() => {
    let hombres = 0, mujeres = 0;
    students.forEach((s) => {
      const g = clasificarGenero(s.gender);
      if (g === "M") hombres++;
      else if (g === "F") mujeres++;
    });
    return { total: students.length, hombres, mujeres };
  }, [students]);

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
    // Todas las notas se muestran redondeadas, sin decimales.
    return Math.round(suma / notasDelAlumno.length);
  }

  function totalMaestro(studentId) {
    return ["ser", "saber", "hacer"].reduce((acc, key) => acc + (promedioDimension(studentId, key) ?? 0), 0);
  }

  function calificacionTrimestral(studentId) {
    return totalMaestro(studentId) + (promedioDimension(studentId, "autoevaluacion") ?? 0);
  }

  const guardarGridNotas = async () => {
    // Antes esto solo guardaba las ediciones de la dimensión activa (la tabla solo
    // mostraba una a la vez). Ahora la tabla muestra SER/SABER/HACER/Autoevaluación
    // juntos, así que se guardan todas las celdas pendientes sin importar de qué
    // dimensión sean.
    const claves = Object.keys(edicionesPendientes);
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
    setPopupGuardado(true);
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

  const eliminarCriterio = async () => {
    if (!criterioAEliminar) return;
    setEliminandoCriterio(true);
    setErrorEliminar("");
    // Las notas del criterio se eliminan en cascada (FK on delete cascade).
    const { error } = await supabase.from("evaluations").delete().eq("id", criterioAEliminar.id);
    setEliminandoCriterio(false);
    if (error) {
      setErrorEliminar("No se pudo eliminar el criterio. Es posible que no tengas permiso o que haya un problema de conexión.");
      return;
    }
    setCriterioAEliminar(null);
    await cargarEvaluaciones();
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
                Todos los criterios de SER, SABER, HACER y Autoevaluación, juntos. Los botones de
                arriba solo sirven para elegir en qué dimensión crear una evaluación nueva.
                {evaluacionActual && <span className="text-slate-400"> · seleccionado para importar: {tituloSinFecha(evaluacionActual.title)}</span>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                Total alumnos: <b>{conteoAlumnos.total}</b>
              </span>
              <span className="px-2.5 py-1 rounded-full bg-pink-50 text-pink-700 border border-pink-200">
                Mujeres: <b>{conteoAlumnos.mujeres}</b>
              </span>
              <span className="px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                Hombres: <b>{conteoAlumnos.hombres}</b>
              </span>
            </div>

            {evaluaciones.length > 0 ? (
              <>
                <div className="bg-white border border-slate-200 rounded">
                  {/* Barra fija: los botones y el desplazamiento horizontal permanecen
                      a la vista aunque se baje por la lista de estudiantes. */}
                  <div className="sticky top-0 z-20 bg-white rounded-t border-b border-slate-200">
                    <div className="flex items-center justify-end gap-3 px-4 pt-2.5 flex-wrap">
                      <button
                        onClick={() => setShowImportarNotas(true)}
                        disabled={!evaluacionActual}
                        className="inline-flex items-center gap-1 text-xs text-slate-600 hover:underline disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" /> Importar notas de 1 criterio
                      </button>
                      <button
                        onClick={() => { setEvaluacionEditando(null); setShowEvalModal(true); }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
                      >
                        <Plus className="h-3.5 w-3.5" /> Nueva evaluación en {DIMENSIONES.find((d) => d.key === dimensionActiva)?.label}
                      </button>
                    </div>
                    {/* Barra de desplazamiento horizontal superior, sincronizada con la tabla */}
                    <div ref={barraSupRef} className="overflow-x-auto mt-1 px-4 pb-1.5" style={{ scrollbarWidth: "thin" }}>
                      <div style={{ width: anchoBarraSup, height: 1 }} aria-hidden="true" />
                    </div>
                  </div>
                  <div ref={tablaScrollRef} className="overflow-x-auto rounded-b">
                  <table className="text-sm border-collapse">
                    <thead>
                      {/* Orden igual al del registro en papel: SER, SABER, HACER, TOTAL,
                          Autoevaluación, Calificación trimestral. */}
                      {/* Fila 1: el nombre de cada dimensión, a lo ancho de sus criterios + su columna "Prom." */}
                      <tr className="text-xs">
                        <th rowSpan={2} className="px-4 py-2 font-medium text-left sticky left-0 bg-white z-10 whitespace-nowrap align-bottom border-b border-slate-200">
                          Estudiante
                        </th>
                        {DIMENSIONES_MAESTRO.map((d) => {
                          const criterios = evaluacionesPorDimension[d.key] || [];
                          return (
                            <th
                              key={d.key}
                              colSpan={criterios.length + 1}
                              className={`px-2 py-1.5 font-semibold text-center border-b border-l border-slate-200 ${COLOR_DIMENSION[d.key]}`}
                            >
                              {d.label} <span className="opacity-60 font-normal">/{d.max}</span>
                            </th>
                          );
                        })}
                        <th rowSpan={2} className="px-4 py-2 font-medium text-right align-bottom border-b border-l border-slate-200 whitespace-nowrap bg-slate-50">TOTAL /95</th>
                        {DIMENSION_AUTOEVAL && (() => {
                          const criterios = evaluacionesPorDimension[DIMENSION_AUTOEVAL.key] || [];
                          return (
                            <th
                              colSpan={criterios.length + 1}
                              className={`px-2 py-1.5 font-semibold text-center border-b border-l border-slate-200 ${COLOR_DIMENSION[DIMENSION_AUTOEVAL.key]}`}
                            >
                              {DIMENSION_AUTOEVAL.label} <span className="opacity-60 font-normal">/{DIMENSION_AUTOEVAL.max}</span>
                            </th>
                          );
                        })()}
                        <th rowSpan={2} className="px-4 py-2 font-medium text-right align-bottom border-b border-l border-slate-200 whitespace-nowrap bg-emerald-50">CALIF. TRIM. /100</th>
                      </tr>
                      {/* Fila 2: un encabezado por criterio (editable, como antes) + "Prom." al final de cada grupo */}
                      <tr className="border-b border-slate-200 text-xs text-slate-500">
                        {[...DIMENSIONES_MAESTRO, ...(DIMENSION_AUTOEVAL ? [DIMENSION_AUTOEVAL] : [])].map((d) => {
                          const criterios = evaluacionesPorDimension[d.key] || [];
                          return (
                            <Fragment key={d.key}>
                              {criterios.map((e) => (
                                <th
                                  key={e.id}
                                  onClick={() => { setDimensionActiva(d.key); setEvaluacionId(e.id); }}
                                  title={e.title}
                                  className={`px-1.5 py-2 font-medium text-center align-bottom cursor-pointer select-none border-l border-slate-100 ${evaluacionId === e.id ? "bg-emerald-50" : ""}`}
                                  style={{ minWidth: 86, maxWidth: 110 }}
                                >
                                  <div className="flex items-start justify-center gap-1">
                                    <span className="leading-tight text-[11px] normal-case font-normal text-slate-700 whitespace-normal break-words">{tituloSinFecha(e.title)}</span>
                                    <button
                                      onClick={(ev) => { ev.stopPropagation(); setEvaluacionEditando(e); setShowEvalModal(true); }}
                                      className="text-slate-300 hover:text-slate-600 shrink-0"
                                      title="Editar criterio"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                    <button
                                      onClick={(ev) => { ev.stopPropagation(); setErrorEliminar(""); setCriterioAEliminar(e); }}
                                      className="text-slate-300 hover:text-red-600 shrink-0"
                                      title="Eliminar criterio"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                  {e.evaluation_date && (
                                    <p className="text-[10px] font-semibold text-slate-500 mt-0.5">{formatearFechaCorta(e.evaluation_date)}</p>
                                  )}
                                  <p className="text-[10px] text-slate-400 font-normal mt-0.5">/{e.maximum_score}</p>
                                </th>
                              ))}
                              <th className="px-3 py-2 font-medium text-right whitespace-nowrap border-l border-slate-100 text-slate-500">Prom.</th>
                            </Fragment>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {students.map((s) => {
                        const resaltada = filaResaltada === s.id;
                        return (
                        <tr key={s.id} className={resaltada ? "bg-amber-200" : ""}>
                          <td
                            onClick={() => setFilaResaltada(resaltada ? null : s.id)}
                            title="Clic para resaltar la fila"
                            className={`px-4 py-1.5 text-slate-800 whitespace-nowrap sticky left-0 z-10 cursor-pointer hover:text-amber-800 ${resaltada ? "bg-amber-200 font-semibold" : "bg-white"}`}
                          >{s.first_name} {s.last_name}</td>
                          {DIMENSIONES_MAESTRO.map((d) => {
                            const criterios = evaluacionesPorDimension[d.key] || [];
                            const prom = promedioDimension(s.id, d.key);
                            return (
                              <Fragment key={d.key}>
                                {criterios.map((e) => (
                                  <td key={e.id} className="px-1 py-1.5 text-center border-l border-slate-50">
                                    <input
                                      type="number" min="0" max={e.maximum_score}
                                      value={valorCelda(e.id, s.id)}
                                      onChange={(ev) => editarCelda(e.id, s.id, ev.target.value)}
                                      className="w-16 rounded border border-slate-300 px-1 py-1 text-xs text-center"
                                      placeholder="—"
                                    />
                                  </td>
                                ))}
                                <td className="px-3 py-1.5 text-right text-slate-600 border-l border-slate-50 whitespace-nowrap">{prom !== null ? prom : "—"}</td>
                              </Fragment>
                            );
                          })}
                          <td className={`px-4 py-1.5 text-right text-slate-700 font-medium border-l border-slate-100 whitespace-nowrap ${resaltada ? "bg-amber-200" : "bg-slate-50"}`}>{totalMaestro(s.id)}</td>
                          {DIMENSION_AUTOEVAL && (() => {
                            const criterios = evaluacionesPorDimension[DIMENSION_AUTOEVAL.key] || [];
                            const prom = promedioDimension(s.id, DIMENSION_AUTOEVAL.key);
                            return (
                              <Fragment key={DIMENSION_AUTOEVAL.key}>
                                {criterios.map((e) => (
                                  <td key={e.id} className="px-1 py-1.5 text-center border-l border-slate-50">
                                    <input
                                      type="number" min="0" max={e.maximum_score}
                                      value={valorCelda(e.id, s.id)}
                                      onChange={(ev) => editarCelda(e.id, s.id, ev.target.value)}
                                      className="w-16 rounded border border-slate-300 px-1 py-1 text-xs text-center"
                                      placeholder="—"
                                    />
                                  </td>
                                ))}
                                <td className="px-3 py-1.5 text-right text-slate-600 border-l border-slate-50 whitespace-nowrap">{prom !== null ? prom : "—"}</td>
                              </Fragment>
                            );
                          })()}
                          <td className={`px-4 py-1.5 text-right font-semibold text-slate-900 border-l border-slate-100 whitespace-nowrap ${resaltada ? "bg-amber-200" : "bg-emerald-50"}`}>{calificacionTrimestral(s.id)}</td>
                        </tr>
                        );
                      })}
                      {students.length === 0 && (
                        <tr>
                          <td
                            colSpan={1 + DIMENSIONES.reduce((acc, d) => acc + (evaluacionesPorDimension[d.key] || []).length + 1, 0) + 2}
                            className="p-6 text-sm text-slate-400 text-center"
                          >
                            No hay estudiantes activos en este curso y paralelo.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  </div>
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
                Crea una evaluación para empezar a registrar notas.
              </div>
            )}
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
      {popupGuardado && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-xs w-full p-6 text-center space-y-3">
            <Check className="h-10 w-10 text-emerald-600 mx-auto" />
            <p className="font-semibold text-lg text-slate-900">Notas guardadas</p>
            <p className="text-sm text-slate-600">Las calificaciones se guardaron correctamente.</p>
            <button
              onClick={() => setPopupGuardado(false)}
              className="text-sm bg-slate-900 text-white px-6 py-2 rounded hover:bg-slate-800"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}
      {criterioAEliminar && (
        <Modal title="Eliminar criterio" onClose={() => setCriterioAEliminar(null)} maxWidth="sm:max-w-sm"
          footer={
            <>
              <button onClick={() => setCriterioAEliminar(null)} className="text-sm text-slate-600 px-4 py-2">Cancelar</button>
              <button
                onClick={eliminarCriterio}
                disabled={eliminandoCriterio}
                className="text-sm bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
              >
                {eliminandoCriterio ? "Eliminando…" : "Sí, eliminar"}
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            ¿Deseas eliminar el criterio <b>"{tituloSinFecha(criterioAEliminar.title)}"</b>?
          </p>
          <p className="text-sm text-red-700">
            Se eliminarán también sus {notasTodas.filter((n) => n.evaluation_id === criterioAEliminar.id).length} nota(s) registradas. Esta acción no se puede deshacer.
          </p>
          {errorEliminar && <p className="text-sm text-red-700">{errorEliminar}</p>}
        </Modal>
      )}
    </div>
  );
}

function EvaluacionModal({ tipos, evaluacion, dimensionPorDefecto, onClose, onSave }) {
  const [titulo, setTitulo] = useState(tituloSinFecha(evaluacion?.title || ""));
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
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Título</label>
        <textarea
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ej. Prueba del segundo bimestre"
          required
          rows={3}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 resize-y"
        />
      </div>
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
      title={`Importar notas — ${tituloSinFecha(evaluacion.title)}`}
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
        onClick={() => generarPlantillaNotas(students, tituloSinFecha(evaluacion.title))}
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

// Compara títulos de evaluaciones ignorando un prefijo de fecha (D/M/AAAA),
// para que no se dupliquen criterios al reimportar.
function mismoTitulo(a, b) {
  return tituloSinFecha(a).trim().toLowerCase() === tituloSinFecha(b).trim().toLowerCase();
}

// Formatea una fecha ISO (AAAA-MM-DD) como D/M/AAAA para mostrarla en pantalla.
function formatearFechaCorta(iso) {
  if (!iso) return "";
  const partes = String(iso).slice(0, 10).split("-");
  if (partes.length !== 3) return "";
  return `${Number(partes[2])}/${Number(partes[1])}/${partes[0]}`;
}

// Ordena evaluaciones de la fecha más antigua a la más reciente (las sin fecha al final).
function ordenPorFecha(a, b) {
  const fa = a.evaluation_date || "";
  const fb = b.evaluation_date || "";
  if (fa !== fb) {
    if (!fa) return 1;
    if (!fb) return -1;
    return fa < fb ? -1 : 1;
  }
  const ca = a.created_at || "";
  const cb = b.created_at || "";
  return ca < cb ? -1 : ca > cb ? 1 : 0;
}

// Clasifica el género del alumno ("M"/"F") tolerando las distintas formas
// en que puede venir cargado: "M"/"F", "Masculino"/"Femenino", "Varón"/"Mujer".
function clasificarGenero(valor) {
  const g = String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  if (["M", "MASCULINO", "VARON", "HOMBRE"].includes(g)) return "M";
  if (["F", "FEMENINO", "MUJER"].includes(g)) return "F";
  return null;
}

// Traduce errores técnicos a mensajes claros en español para la importación de notas.
function mensajeErrorImportacion(err) {

  const msg = err?.message || "";
  if (msg.includes("ON CONFLICT DO UPDATE command cannot affect row a second time")) {
    return "El archivo tiene dos o más columnas con el mismo nombre. Revisa los títulos de los criterios en el Excel, deja un solo nombre por columna y vuelve a intentarlo.";
  }
  if (msg.includes("duplicate key value")) {
    return "Algunos datos ya existen con la misma identificación. Si deseas reemplazarlos, confirma la importación cuando el sistema te lo pregunte.";
  }
  if (msg.includes("violates foreign key constraint")) {
    return "Hay alumnos o evaluaciones que ya no existen en el sistema. Recarga la página y vuelve a intentarlo.";
  }
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || /network/i.test(msg)) {
    return "Se perdió la conexión con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.";
  }
  return `No se pudo completar la importación: ${msg || "error desconocido"}.`;
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
  const [avisoReemplazo, setAvisoReemplazo] = useState(null); // { cantidad } cuando ya existen notas
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
    return resultado.criterios[dim].filter((c) => !evaluaciones.some(
      (e) => (e.dimension || "hacer") === dim && mismoTitulo(e.title, c.titulo)
    )).length;
  };

  const encontrados = alumnosCruzados.filter((a) => a.alumnoDB).length;
  const noEncontrados = alumnosCruzados.length - encontrados;

  const confirmar = async (forzarReemplazo = false) => {
    if (!resultado) return;
    setImportando(true);
    setError("");
    try {
      // Se trabaja sobre una copia local para no mutar las props durante el proceso.
      const evaluacionesTodas = [...evaluaciones];

      // Paso 0: detectar si ya existen notas para las evaluaciones que se van a reutilizar.
      // Si las hay, se pregunta al usuario si desea reemplazar la información anterior.
      const idsReutilizados = [];
      for (const dim of ["ser", "saber", "hacer"]) {
        for (const criterio of resultado.criterios[dim]) {
          const existente = evaluacionesTodas.find(
            (e) => (e.dimension || "hacer") === dim && mismoTitulo(e.title, criterio.titulo)
          );
          if (existente) idsReutilizados.push(existente.id);
        }
      }
      const autoExistente = evaluacionesTodas.find((e) => (e.dimension || "hacer") === "autoevaluacion");
      if (autoExistente && alumnosCruzados.some((a) => a.valores.autoeval !== null)) {
        idsReutilizados.push(autoExistente.id);
      }

      if (!forzarReemplazo && idsReutilizados.length > 0) {
        const { count, error: errCount } = await supabase
          .from("grades")
          .select("id", { count: "exact", head: true })
          .in("evaluation_id", idsReutilizados);
        if (errCount) throw errCount;
        if ((count || 0) > 0) {
          setImportando(false);
          setAvisoReemplazo({ cantidad: count });
          return;
        }
      }

      // Paso 0b: si el usuario confirmó el reemplazo, primero se eliminan las notas
      // existentes de los alumnos que se van a importar, para evitar duplicados.
      if (forzarReemplazo && idsReutilizados.length > 0) {
        const idsEstudiantes = alumnosCruzados.filter((a) => a.alumnoDB).map((a) => a.alumnoDB.id);
        if (idsEstudiantes.length > 0) {
          const { error: errDel } = await supabase
            .from("grades")
            .delete()
            .in("evaluation_id", idsReutilizados)
            .in("student_id", idsEstudiantes);
          if (errDel) throw errDel;
        }
      }

      // Paso 1: crear o reutilizar las evaluaciones de cada criterio detectado
      const idsPorDimension = { ser: [], saber: [], hacer: [] };
      for (const dim of ["ser", "saber", "hacer"]) {
        for (const criterio of resultado.criterios[dim]) {
          const existente = evaluacionesTodas.find(
            (e) => (e.dimension || "hacer") === dim && mismoTitulo(e.title, criterio.titulo)
          );
          if (existente) {
            idsPorDimension[dim].push(existente.id);
            // La fecha del Excel se guarda por separado en la base de datos.
            if (criterio.fecha && existente.evaluation_date !== criterio.fecha) {
              await supabase.from("evaluations").update({ evaluation_date: criterio.fecha }).eq("id", existente.id);
              existente.evaluation_date = criterio.fecha;
            }
          } else {
            const { data, error: errIns } = await supabase.from("evaluations").insert({
              subject_id: subjectId, teacher_id: user.id, course_id: courseId, parallel_id: parallelId,
              dimension: dim, title: criterio.titulo, evaluation_date: criterio.fecha || new Date().toISOString().slice(0, 10),
              maximum_score: DIMENSION_MAX[dim],
            }).select().single();
            if (errIns) throw errIns;
            idsPorDimension[dim].push(data.id);
            evaluacionesTodas.push(data); // para que futuras vueltas del loop lo detecten como existente
          }
        }
      }

      // Paso 2: autoevaluación (una sola evaluación reutilizable)
      const hayAutoeval = alumnosCruzados.some((a) => a.valores.autoeval !== null);
      let autoevalId = null;
      if (hayAutoeval) {
        const existente = evaluacionesTodas.find((e) => (e.dimension || "hacer") === "autoevaluacion");
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

      // Paso 4: eliminar duplicados por (evaluation_id, student_id). Si el Excel trae dos
      // columnas con el mismo título, se conserva el último valor y se evita el error
      // "ON CONFLICT DO UPDATE command cannot affect row a second time".
      const vistos = new Map();
      let duplicados = 0;
      for (const r of registros) {
        const clave = `${r.evaluation_id}:${r.student_id}`;
        if (vistos.has(clave)) duplicados++;
        vistos.set(clave, r);
      }
      const registrosUnicos = [...vistos.values()];

      if (registrosUnicos.length > 0) {
        const { error: errUp } = await supabase.from("grades").upsert(registrosUnicos, { onConflict: "evaluation_id,student_id" });
        if (errUp) throw errUp;
      }

      setResumen({ criterios: totalCriterios, notas: registrosUnicos.length, alumnos: encontrados, duplicados, reemplazo: forzarReemplazo });
      setAvisoReemplazo(null);
      setImportando(false);
      await onImported();
    } catch (err) {
      setImportando(false);
      setError(mensajeErrorImportacion(err));
    }
  };

  return (
    <>
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

    </Modal>
    {resumen && (
      <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 text-center space-y-3">
          <Check className="h-10 w-10 text-emerald-600 mx-auto" />
          <p className="font-semibold text-lg text-slate-900">Datos importados</p>
          <p className="text-sm text-slate-600">
            Se {resumen.reemplazo ? "reemplazaron" : "guardaron"} <b>{resumen.notas}</b> notas de <b>{resumen.criterios}</b> criterios
            para <b>{resumen.alumnos}</b> alumnos.
            {resumen.reemplazo && (
              <span className="block text-xs text-amber-700 mt-2">La información anterior fue reemplazada por los datos del archivo.</span>
            )}
            {resumen.duplicados > 0 && (
              <span className="block text-xs text-slate-500 mt-1">
                Se consolidaron {resumen.duplicados} valores duplicados del archivo (columnas con el mismo nombre).
              </span>
            )}
          </p>
          <button
            onClick={() => { setResumen(null); onClose(); }}
            className="text-sm bg-slate-900 text-white px-6 py-2 rounded hover:bg-slate-800"
          >
            Aceptar
          </button>
        </div>
      </div>
    )}
    {avisoReemplazo && (
      <div className="fixed inset-0 z-40 bg-slate-900/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-5">
          <div className="flex items-center gap-2 text-amber-700 mb-2">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="font-semibold text-sm">Ya existen notas registradas</p>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            Se encontraron <b>{avisoReemplazo.cantidad}</b> notas guardadas para estas evaluaciones.
            ¿Deseas <b>reemplazar</b> la información anterior con los datos del archivo Excel?
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setAvisoReemplazo(null)}
              className="text-sm text-slate-600 px-4 py-2 rounded border border-slate-300 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={() => confirmar(true)}
              disabled={importando}
              className="text-sm bg-amber-600 text-white px-4 py-2 rounded hover:bg-amber-700 disabled:opacity-50"
            >
              {importando ? "Reemplazando…" : "Sí, reemplazar"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
