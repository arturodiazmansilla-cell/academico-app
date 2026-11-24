import { useEffect, useMemo, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { Printer, FileSpreadsheet, ClipboardX, TrendingDown, FileText, Users } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import {
  DIMENSIONES,
  NOTA_MINIMA,
  PAPELES,
  alumnosBajoRendimiento,
  alumnosQueDebenExamen,
  htmlReporte,
  imprimirHtml,
  tablaBajoRendimiento,
  tablaExamen,
} from "../lib/reportesNotas";
import { nombreSeguro } from "../lib/reportesExcel";
import {
  DIMENSIONES as DIMENSIONES_CALIF,
  evaluacionesPorDimension,
  promedioDimension,
  totalDimensiones,
  calificacionTrimestral,
  cualitativoDe,
} from "../lib/notasCalculo";
import ReporteCalificacionModal from "../components/ReporteCalificacionModal";

// Trimestre que se selecciona por defecto: el vigente y, si no hay, el que contiene la fecha de hoy.
function elegirVigente(periodos) {
  const hoy = new Date().toISOString().slice(0, 10);
  return (
    periodos.find((p) => p.active) ||
    periodos.find((p) => p.start_date && p.start_date <= hoy && (!p.end_date || p.end_date >= hoy)) ||
    null
  );
}

// Cada URL /reportes/:tipo corresponde a uno de estos 4 reportes (el submenú de la
// izquierda enlaza directo a cada una). "categoria" define qué filtros y qué bloque de
// resultados se muestran más abajo.
const REPORTES_INFO = {
  examen: {
    categoria: "alumnos",
    titulo: "Alumnos que deben examen",
    descripcion: "Alumnos sin nota en actividades del SABER, HACER (y SER si lo marcas).",
    icono: ClipboardX,
  },
  bajo: {
    categoria: "alumnos",
    titulo: "Alumnos con bajo rendimiento",
    descripcion: `Promedio final del trimestre menor a ${NOTA_MINIMA}.`,
    icono: TrendingDown,
  },
  calificacion: {
    categoria: "materias",
    titulo: "Reporte de Calificación",
    descripcion: "Planilla de notas de la materia, curso y paralelo seleccionados, en PDF o Excel, lista para imprimir.",
    icono: FileText,
  },
  profesores: {
    categoria: "profesores",
    titulo: "Reporte de Profesores",
    descripcion: "Materias y cursos asignados, asistencia y notas registradas por cada profesor.",
    icono: Users,
  },
};

// Slug de la URL -> "tipo" interno. Por ahora coinciden, salvo bajo-rendimiento.
const SLUG_A_TIPO = { examen: "examen", "bajo-rendimiento": "bajo", calificacion: "calificacion", profesores: "profesores" };

// Muestra la tabla igual que saldrá en el PDF y en el Excel.
function TablaPantalla({ tabla }) {
  const suma = tabla.columnas.reduce((a, c) => a + c.peso, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] table-fixed text-sm">
        <colgroup>
          {tabla.columnas.map((c, i) => <col key={i} style={{ width: `${(c.peso / suma) * 100}%` }} />)}
        </colgroup>
        <thead>
          <tr className="bg-slate-900 text-left text-xs text-white">
            {tabla.columnas.map((c, i) => (
              <th key={i} className={`px-3 py-2.5 font-medium ${c.alinear === "center" ? "text-center" : ""}`}>{c.titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tabla.filas.map((fila, r) => (
            <tr key={r} className="align-top even:bg-slate-50/70">
              {fila.map((celda, i) => {
                const centro = tabla.columnas[i]?.alinear === "center" ? "text-center" : "";
                if (Array.isArray(celda)) {
                  return (
                    <td key={i} className="px-3 py-2">
                      <ul className="space-y-1">
                        {celda.map((t, k) => (
                          <li key={k} className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs leading-snug text-amber-900">{t}</li>
                        ))}
                      </ul>
                    </td>
                  );
                }
                if (typeof celda === "object") {
                  return <td key={i} className={`px-3 py-2 ${centro} ${celda.alerta ? "font-bold text-red-700" : ""}`}>{celda.texto}</td>;
                }
                return (
                  <td key={i} className={`px-3 py-2 ${centro} ${celda === "—" ? "text-slate-300" : i === 1 ? "font-medium text-slate-800" : "text-slate-700"}`}>{celda}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Dato({ etiqueta, valor, detalle }) {
  return (
    <div className="rounded border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs text-slate-500">{etiqueta}</p>
      <p className="mt-0.5 text-xl font-semibold text-slate-900">{valor}</p>
      {detalle && <p className="text-[11px] text-slate-400">{detalle}</p>}
    </div>
  );
}

export default function Reportes() {
  const { institutionName, logoUrl } = useSettings();
  const { profile } = useAuth();
  const { tipo: slug } = useParams();
  // Un slug desconocido (URL escrita a mano) se trata como "examen"; el resto de los
  // Hooks de abajo deben ejecutarse siempre en el mismo orden, así que no se corta acá.
  const slugValido = Boolean(SLUG_A_TIPO[slug]);
  const reporte = SLUG_A_TIPO[slug] || "examen";
  const categoria = REPORTES_INFO[reporte].categoria; // "alumnos" | "materias" | "profesores"

  const [subjects, setSubjects] = useState([]);
  const [courses, setCourses] = useState([]);
  const [parallels, setParallels] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [qualitativeRanges, setQualitativeRanges] = useState([]);
  const [subjectId, setSubjectId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [parallelId, setParallelId] = useState("");
  const [periodId, setPeriodId] = useState("");

  const [students, setStudents] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [grades, setGrades] = useState({});
  const [extras, setExtras] = useState({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const [showReporteCalificacion, setShowReporteCalificacion] = useState(false);

  // Reporte de Profesores: institución completa, solo depende del trimestre.
  const [profesoresFilas, setProfesoresFilas] = useState([]); // [{ profesor, asignaciones, asistencias, actividades, notas, sinActividad }]
  const [cargandoProfesores, setCargandoProfesores] = useState(false);
  const [errorProfesores, setErrorProfesores] = useState("");
  // Opciones del reporte "deben examen"
  const [dimensiones, setDimensiones] = useState(["saber", "hacer"]);
  const [incluirSinNotas, setIncluirSinNotas] = useState(false);
  // Salida (PDF y Excel)
  const [papel, setPapel] = useState("carta"); // carta | oficio
  const [orientacionElegida, setOrientacionElegida] = useState(null); // null = automática según el reporte
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    async function cargarBase() {
      const [{ data: subj }, { data: cur }, { data: par }, { data: per }, { data: rangos }] = await Promise.all([
        supabase.from("subjects").select("*").eq("active", true).order("name"),
        supabase.from("courses").select("*").eq("active", true).order("name"),
        supabase.from("parallels").select("*").eq("active", true).order("name"),
        supabase.from("academic_periods").select("*").order("start_date"),
        supabase.from("qualitative_ranges").select("*").order("min_score"),
      ]);
      setSubjects(subj || []);
      setCourses(cur || []);
      setParallels(par || []);
      setPeriods(per || []);
      setQualitativeRanges(rangos || []);
      const vigente = elegirVigente(per || []);
      if (vigente) setPeriodId(vigente.id);
    }
    cargarBase();
  }, []);

  const paralelosDelCurso = useMemo(() => parallels.filter((p) => p.course_id === courseId), [parallels, courseId]);

  const filtrosCompletos = Boolean(subjectId && courseId && parallelId && periodId);

  useEffect(() => {
    let vigente = true; // evita que una respuesta lenta pise a una más nueva
    async function cargarDatos() {
      setError("");
      if (!filtrosCompletos) {
        setStudents([]); setEvaluations([]); setGrades({}); setExtras({});
        return;
      }
      setCargando(true);
      try {
        const [est, evals, term] = await Promise.all([
          supabase.from("students").select("*").eq("course_id", courseId).eq("parallel_id", parallelId).eq("active", true).order("last_name"),
          supabase.from("evaluations").select("*")
            .eq("subject_id", subjectId).eq("course_id", courseId).eq("parallel_id", parallelId).eq("academic_period_id", periodId)
            .order("evaluation_date"),
          supabase.from("term_extras").select("*")
            .eq("subject_id", subjectId).eq("course_id", courseId).eq("parallel_id", parallelId).eq("academic_period_id", periodId),
        ]);
        const fallo = est.error || evals.error || term.error;
        if (fallo) throw new Error(fallo.message);

        const listaEvals = evals.data || [];
        const notas = {};
        if (listaEvals.length > 0) {
          const { data: gradesData, error: errNotas } = await supabase
            .from("grades").select("*").in("evaluation_id", listaEvals.map((e) => e.id));
          if (errNotas) throw new Error(errNotas.message);
          (gradesData || []).forEach((g) => {
            notas[g.student_id] = notas[g.student_id] || {};
            notas[g.student_id][g.evaluation_id] = g.score;
          });
        }
        const mapaExtras = {};
        (term.data || []).forEach((t) => {
          mapaExtras[t.student_id] = { self_evaluation: t.self_evaluation, project_score: t.project_score };
        });

        if (!vigente) return;
        setStudents(est.data || []);
        setEvaluations(listaEvals);
        setGrades(notas);
        setExtras(mapaExtras);
      } catch (e) {
        if (vigente) setError("No se pudieron cargar los datos: " + (e?.message || "error desconocido"));
      } finally {
        if (vigente) setCargando(false);
      }
    }
    cargarDatos();
    return () => { vigente = false; };
  }, [subjectId, courseId, parallelId, periodId, filtrosCompletos]);

  // Carga y agrega los datos del Reporte de Profesores cuando se elige esa categoría
  // y hay un trimestre seleccionado. No depende de materia/curso/paralelo.
  useEffect(() => {
    let vigente = true;
    async function cargarProfesores() {
      if (categoria !== "profesores" || !periodId) return;
      setCargandoProfesores(true);
      setErrorProfesores("");
      try {
        const periodo = periods.find((p) => p.id === periodId);

        const [{ data: docentes, error: e1 }, { data: asign, error: e2 }, { data: evals, error: e3 }] = await Promise.all([
          supabase.from("profiles").select("*").eq("role", "teacher").eq("active", true).order("full_name"),
          supabase.from("teacher_subjects").select("*"),
          supabase.from("evaluations").select("id, teacher_id").eq("academic_period_id", periodId),
        ]);
        const fallo1 = e1 || e2 || e3;
        if (fallo1) throw new Error(fallo1.message);

        const evalIds = (evals || []).map((e) => e.id);
        const [{ data: notasData, error: e4 }, sesionesRes] = await Promise.all([
          evalIds.length > 0
            ? supabase.from("grades").select("id, registered_by, evaluation_id").in("evaluation_id", evalIds)
            : Promise.resolve({ data: [], error: null }),
          // Se filtra por fecha de la sesión (no por academic_period_id) porque esa columna
          // se agregó después y puede no estar completa en sesiones antiguas.
          periodo?.start_date && periodo?.end_date
            ? supabase.from("class_sessions").select("id, teacher_id").gte("class_date", periodo.start_date).lte("class_date", periodo.end_date)
            : supabase.from("class_sessions").select("id, teacher_id"),
        ]);
        const e5 = sesionesRes.error;
        if (e4 || e5) throw new Error((e4 || e5).message);

        const sesiones = sesionesRes.data || [];
        const notas = notasData || [];

        const filas = (docentes || []).map((doc) => {
          const propias = (asign || []).filter((a) => a.teacher_id === doc.id);
          const asignaciones = propias
            .map((a) => {
              const materia = nombreDe(subjects, a.subject_id);
              const curso = `${nombreDe(courses, a.course_id)} ${nombreDe(parallels, a.parallel_id)}`.trim();
              return [materia, curso].filter(Boolean).join(" · ");
            })
            .filter(Boolean);

          const actividades = evals.filter((e) => e.teacher_id === doc.id).length;
          const asistencias = sesiones.filter((s) => s.teacher_id === doc.id).length;
          const notasCount = notas.filter((n) => n.registered_by === doc.id).length;

          return {
            profesor: doc.full_name || doc.email || "(sin nombre)",
            asignaciones,
            actividades,
            asistencias,
            notas: notasCount,
            sinActividad: actividades === 0 && asistencias === 0 && notasCount === 0,
          };
        });

        if (!vigente) return;
        setProfesoresFilas(filas);
      } catch (e) {
        if (vigente) setErrorProfesores("No se pudo cargar el reporte: " + (e?.message || "error desconocido"));
      } finally {
        if (vigente) setCargandoProfesores(false);
      }
    }
    cargarProfesores();
    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoria, periodId, subjects, courses, parallels, periods]);

  const cualitativo = (valor) => {
    if (valor === null || valor === undefined) return "";
    const r = qualitativeRanges.find((x) => valor >= Number(x.min_score) && valor <= Number(x.max_score));
    return r?.label ?? "";
  };

  const examen = useMemo(
    () => alumnosQueDebenExamen(students, evaluations, grades, { dimensiones, incluirSinNotas }),
    [students, evaluations, grades, dimensiones, incluirSinNotas],
  );
  const bajo = useMemo(
    () => alumnosBajoRendimiento(students, evaluations, grades, extras),
    [students, evaluations, grades, extras],
  );

  const nombreDe = (lista, id) => lista.find((x) => x.id === id)?.name || "";

  // Arma los datos del "Reporte de Calificación" con lo que ya está cargado en pantalla
  // (misma materia/curso/paralelo/trimestre que eligieron los filtros de arriba).
  const obtenerDatosCalificacion = async () => ({
    institucion: institutionName || "",
    anio: `${nombreDe(courses, courseId)} ${nombreDe(parallels, parallelId)}`.trim(),
    materia: nombreDe(subjects, subjectId),
    trimestre: nombreDe(periods, periodId),
    maestro: profile?.full_name || "",
    dimensiones: DIMENSIONES_CALIF.map((d) => ({
      label: d.label,
      max: d.max,
      evaluaciones: evaluacionesPorDimension(evaluations, d.key).map((e) => ({ title: e.title, fecha: e.evaluation_date })),
    })),
    filas: students.map((st) => {
      const calif = calificacionTrimestral(evaluations, grades, extras, st.id);
      return {
        nombre: `${st.last_name}, ${st.first_name}`,
        dims: DIMENSIONES_CALIF.map((d) => ({
          notas: evaluacionesPorDimension(evaluations, d.key).map((e) => grades[st.id]?.[e.id] ?? null),
          prom: promedioDimension(evaluations, grades, st.id, d.key),
        })),
        autoev: extras[st.id]?.self_evaluation ?? null,
        proyecto: extras[st.id]?.project_score ?? null,
        total: totalDimensiones(evaluations, grades, st.id),
        calif,
        cual: cualitativoDe(qualitativeRanges, calif)?.label ?? "",
      };
    }),
  });

  const alternarDimension = (key) =>
    setDimensiones((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const detalleComun = () => [
    ["Materia", nombreDe(subjects, subjectId)],
    ["Curso", `${nombreDe(courses, courseId)} ${nombreDe(parallels, parallelId)}`.trim()],
    ["Trimestre", nombreDe(periods, periodId)],
  ];

  // Una sola tabla alimenta la pantalla, el PDF y el Excel.
  const tabla = useMemo(
    () =>
      reporte === "examen"
        ? tablaExamen(examen.filas, students.length, dimensiones, detalleComun())
        : tablaBajoRendimiento(bajo.filas, students.length, detalleComun(), (n) => cualitativo(n)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reporte, examen, bajo, students, dimensiones, subjectId, courseId, parallelId, periodId, subjects, courses, parallels, periods, qualitativeRanges],
  );

  const tablaProfesores = useMemo(() => {
    const nombreTrimestre = nombreDe(periods, periodId);
    return {
      titulo: "Reporte de Profesores",
      // Mismo formato [etiqueta, valor] que usan tablaExamen/tablaBajoRendimiento (obligatorio:
      // reportesExcel.ts recorre "detalle" y falla si no es un arreglo de pares).
      detalle: [
        ["Trimestre", nombreTrimestre || "—"],
        ["Total de profesores", String(profesoresFilas.length)],
      ],
      resumen: `${profesoresFilas.length} profesor(es) · ${nombreTrimestre}`,
      columnas: [
        { titulo: "N°", peso: 4, alinear: "center" },
        { titulo: "Profesor", peso: 20 },
        { titulo: "Materias y cursos asignados", peso: 28 },
        { titulo: "Asistencias", peso: 11, alinear: "center" },
        { titulo: "Actividades", peso: 11, alinear: "center" },
        { titulo: "Notas", peso: 10, alinear: "center" },
        { titulo: "Estado", peso: 16 },
      ],
      // Las celdas van como texto (String), igual que en los otros reportes: reportesExcel.ts
      // no sabe mostrar números sueltos, solo string | string[] | {texto, alerta}.
      filas: profesoresFilas.map((f, i) => [
        String(i + 1),
        f.profesor,
        f.asignaciones.length > 0 ? f.asignaciones : "—",
        String(f.asistencias),
        String(f.actividades),
        String(f.notas),
        f.sinActividad ? { texto: "Sin actividad este trimestre", alerta: true } : "Activo",
      ]),
      vacio: "No hay profesores registrados.",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profesoresFilas, periodId, periods]);

  const sinActividadCount = profesoresFilas.filter((f) => f.sinActividad).length;

  // El reporte de bajo rendimiento y el de profesores tienen más columnas: por defecto salen horizontales.
  const orientacion = orientacionElegida ?? (reporte === "bajo" || reporte === "profesores" ? "horizontal" : "vertical");

  // La barra de exportar (Papel/Orientación/PDF/Excel) es la misma para Alumnos y Profesores;
  // solo cambia de qué tabla generérica toma los datos.
  const tablaSalida = categoria === "profesores" ? tablaProfesores : tabla;

  const opcionesSalida = () => ({
    institucion: institutionName || "",
    logoUrl,
    papel,
    orientacion,
    docente: profile?.full_name || "",
  });

  const imprimir = () => {
    try {
      imprimirHtml(htmlReporte(tablaSalida, opcionesSalida()));
    } catch (e) {
      alert("No se pudo generar el PDF: " + (e?.message || "error desconocido"));
    }
  };

  const exportarExcel = async () => {
    if (exportando) return;
    setExportando(true);
    try {
      const { descargarExcel } = await import("../lib/reportesExcel");
      const base =
        reporte === "examen" ? "Reporte_deben_examen" : reporte === "bajo" ? "Reporte_bajo_rendimiento" : "Reporte_profesores";
      const nombreArchivo =
        categoria === "profesores"
          ? [base, nombreSeguro(nombreDe(periods, periodId))].filter(Boolean).join("_")
          : [base, nombreSeguro(nombreDe(subjects, subjectId)), nombreSeguro(`${nombreDe(courses, courseId)}_${nombreDe(parallels, parallelId)}`)]
              .filter(Boolean)
              .join("_");
      await descargarExcel(tablaSalida, { ...opcionesSalida(), nombreArchivo });
    } catch (e) {
      const msg = e?.message || "error desconocido";
      alert("No se pudo generar el Excel: " + msg + (/exceljs|Failed to resolve|import/i.test(msg) ? "\n\nSi es la primera vez, instala la librería con: npm i exceljs" : ""));
    } finally {
      setExportando(false);
    }
  };

  const hayResultados = tabla.filas.length > 0;
  const califMasBaja = bajo.filas.length > 0 ? bajo.filas[0].resumen.calif : "—";

  // El reporte de Profesores no depende de una materia/curso/paralelo puntual (mira a todos
  // los profesores de la institución), así que esos tres filtros se ocultan en esa categoría.
  const filtrosSoloTrimestre = categoria === "profesores";

  // Recién acá es seguro cortar la ejecución: todos los Hooks de arriba ya se ejecutaron.
  if (!slugValido) return <Navigate to="/reportes/examen" replace />;

  const info = REPORTES_INFO[reporte];
  const InfoIcono = info.icono;

  return (
    <div className="p-4 md:p-8 space-y-5">
      {/* Qué reporte se está viendo (se elige desde el submenú "Reportes" de la izquierda) */}
      <div className="flex items-start gap-3">
        <InfoIcono className="h-6 w-6 mt-0.5 text-slate-700 shrink-0" />
        <div>
          <h2 className="font-ledger text-lg font-semibold text-slate-900">{info.titulo}</h2>
          <p className="text-sm text-slate-500">{info.descripcion}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-slate-200 rounded p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        {!filtrosSoloTrimestre && (
          <>
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
          </>
        )}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Trimestre</label>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="">Selecciona…</option>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? " (vigente)" : ""}</option>)}
          </select>
        </div>
      </div>

      {/* Materias: un solo reporte en esta categoría, así que va directo a un botón. */}
      {categoria === "materias" && filtrosCompletos && (
        <div className="bg-white border border-slate-200 rounded p-8 text-center space-y-3">
          <p className="text-sm text-slate-600">
            {nombreDe(subjects, subjectId)} · {nombreDe(courses, courseId)} {nombreDe(parallels, parallelId)} · {nombreDe(periods, periodId)}
          </p>
          <button
            type="button"
            onClick={() => setShowReporteCalificacion(true)}
            className="inline-flex items-center gap-2 rounded bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            <FileText className="h-4 w-4" /> Generar Reporte de Calificación
          </button>
        </div>
      )}

      {categoria === "materias" && showReporteCalificacion && (
        <ReporteCalificacionModal
          obtenerDatos={obtenerDatosCalificacion}
          logoUrl={logoUrl}
          onClose={() => setShowReporteCalificacion(false)}
        />
      )}

      {categoria === "profesores" && !periodId && (
        <div className="bg-white border border-slate-200 rounded p-8 text-center text-sm text-slate-500">
          Selecciona un trimestre para generar el reporte.
        </div>
      )}

      {categoria === "profesores" && periodId && cargandoProfesores && (
        <div className="bg-white border border-slate-200 rounded p-8 text-center text-sm text-slate-400">Cargando…</div>
      )}

      {categoria === "profesores" && periodId && errorProfesores && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorProfesores}</div>
      )}

      {categoria === "profesores" && periodId && !cargandoProfesores && !errorProfesores && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Dato etiqueta="Profesores" valor={profesoresFilas.length} />
            <Dato etiqueta="Sin actividad este trimestre" valor={sinActividadCount} detalle="sin asistencia, actividades ni notas" />
            <Dato etiqueta="Trimestre" valor={nombreDe(periods, periodId) || "—"} />
          </div>

          <div className="bg-white border border-slate-200 rounded">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="font-ledger text-base font-semibold text-slate-900">{tablaProfesores.titulo}</h2>
                <p className="text-xs text-slate-500">{tablaProfesores.resumen}</p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Papel</label>
                  <select value={papel} onChange={(e) => setPapel(e.target.value)} className="rounded border border-slate-300 px-2.5 py-2 text-sm">
                    {Object.entries(PAPELES).map(([k, v]) => <option key={k} value={k}>{v.etiqueta}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Orientación</label>
                  <select value={orientacion} onChange={(e) => setOrientacionElegida(e.target.value)} className="rounded border border-slate-300 px-2.5 py-2 text-sm">
                    <option value="vertical">Vertical</option>
                    <option value="horizontal">Horizontal</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={imprimir}
                  disabled={profesoresFilas.length === 0}
                  title="Abre la vista de impresión: elige “Guardar como PDF” o imprime"
                  className="inline-flex items-center gap-2 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <Printer className="h-4 w-4" /> PDF
                </button>
                <button
                  type="button"
                  onClick={exportarExcel}
                  disabled={profesoresFilas.length === 0 || exportando}
                  className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <FileSpreadsheet className="h-4 w-4" /> {exportando ? "Generando…" : "Excel"}
                </button>
              </div>
            </div>

            {profesoresFilas.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No hay profesores activos registrados.</p>
            ) : (
              <TablaPantalla tabla={tablaProfesores} />
            )}
          </div>
        </>
      )}

      {categoria !== "profesores" && !filtrosCompletos && (
        <div className="bg-white border border-slate-200 rounded p-8 text-center text-sm text-slate-500">
          Selecciona materia, curso, paralelo y trimestre para generar el reporte.
        </div>
      )}

      {categoria === "alumnos" && filtrosCompletos && cargando && (
        <div className="bg-white border border-slate-200 rounded p-8 text-center text-sm text-slate-400">Cargando…</div>
      )}

      {categoria === "alumnos" && filtrosCompletos && error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {categoria === "alumnos" && filtrosCompletos && !cargando && !error && (
        <>
          {/* Resumen */}
          <div className="grid gap-3 sm:grid-cols-3">
            {reporte === "examen" ? (
              <>
                <Dato etiqueta="Alumnos con actividades sin nota" valor={`${examen.filas.length} de ${students.length}`} />
                <Dato etiqueta="Actividades revisadas" valor={examen.revisadas.length} detalle={dimensiones.map((d) => d.toUpperCase()).join(" · ") || "ninguna dimensión"} />
                <Dato etiqueta="Omitidas (nadie tiene nota)" valor={examen.omitidas.length} detalle={incluirSinNotas ? "incluidas en el reporte" : "aún sin calificar"} />
              </>
            ) : (
              <>
                <Dato etiqueta={`Con calificación menor a ${NOTA_MINIMA}`} valor={`${bajo.filas.length} de ${students.length}`} />
                <Dato etiqueta="Calificación más baja" valor={califMasBaja} />
                <Dato etiqueta="Alumnos sin ninguna nota" valor={bajo.sinCalificacion} detalle="no entran en este reporte" />
              </>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded">
            {/* Barra de opciones de salida */}
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="font-ledger text-base font-semibold text-slate-900">{tabla.titulo}</h2>
                <p className="text-xs text-slate-500">{tabla.resumen}</p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Papel</label>
                  <select value={papel} onChange={(e) => setPapel(e.target.value)} className="rounded border border-slate-300 px-2.5 py-2 text-sm">
                    {Object.entries(PAPELES).map(([k, v]) => <option key={k} value={k}>{v.etiqueta}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Orientación</label>
                  <select value={orientacion} onChange={(e) => setOrientacionElegida(e.target.value)} className="rounded border border-slate-300 px-2.5 py-2 text-sm">
                    <option value="vertical">Vertical</option>
                    <option value="horizontal">Horizontal</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={imprimir}
                  disabled={students.length === 0}
                  title="Abre la vista de impresión: elige “Guardar como PDF” o imprime"
                  className="inline-flex items-center gap-2 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <Printer className="h-4 w-4" /> PDF
                </button>
                <button
                  type="button"
                  onClick={exportarExcel}
                  disabled={students.length === 0 || exportando}
                  className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <FileSpreadsheet className="h-4 w-4" /> {exportando ? "Generando…" : "Excel"}
                </button>
              </div>
            </div>

            {reporte === "examen" && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
                <span className="text-xs font-medium text-slate-500">Revisar:</span>
                {DIMENSIONES.map((d) => (
                  <label key={d.key} className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={dimensiones.includes(d.key)} onChange={() => alternarDimension(d.key)} />
                    {d.label}
                  </label>
                ))}
                <label className="inline-flex items-center gap-1.5 md:ml-auto">
                  <input type="checkbox" checked={incluirSinNotas} onChange={(e) => setIncluirSinNotas(e.target.checked)} />
                  Incluir actividades que aún no tienen ninguna nota
                </label>
              </div>
            )}

            {students.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No hay alumnos activos en este curso y paralelo.</p>
            )}

            {students.length > 0 && !hayResultados && (
              <p className="px-4 py-8 text-center text-sm text-emerald-700">
                {reporte === "examen" && evaluations.length === 0 ? "Aún no hay actividades registradas en este trimestre." : tabla.vacio}
              </p>
            )}

            {hayResultados && <TablaPantalla tabla={tabla} />}

            {reporte === "examen" && examen.omitidas.length > 0 && (
              <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
                Se omitieron {examen.omitidas.length} actividad(es) que ningún alumno tiene calificada todavía:{" "}
                {examen.omitidas.map((e) => e.title || "Sin título").join(", ")}. Actívalas con “Incluir actividades que aún no tienen ninguna nota”.
              </p>
            )}

            {reporte === "bajo" && bajo.sinCalificacion > 0 && (
              <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
                {bajo.sinCalificacion} alumno(s) no tienen ninguna nota y no aparecen aquí; revísalos en el reporte “Alumnos que deben examen”.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
