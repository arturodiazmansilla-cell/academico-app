import { useEffect, useMemo, useState } from "react";
import { Printer, FileSpreadsheet, ClipboardX, TrendingDown } from "lucide-react";
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

// Trimestre que se selecciona por defecto: el vigente y, si no hay, el que contiene la fecha de hoy.
function elegirVigente(periodos) {
  const hoy = new Date().toISOString().slice(0, 10);
  return (
    periodos.find((p) => p.active) ||
    periodos.find((p) => p.start_date && p.start_date <= hoy && (!p.end_date || p.end_date >= hoy)) ||
    null
  );
}

const REPORTES = [
  {
    key: "examen",
    titulo: "Alumnos que deben examen",
    descripcion: "Alumnos sin nota en actividades del SABER, HACER (y SER si lo marcas).",
    icono: ClipboardX,
  },
  {
    key: "bajo",
    titulo: "Alumnos con bajo rendimiento",
    descripcion: `Promedio final del trimestre menor a ${NOTA_MINIMA}.`,
    icono: TrendingDown,
  },
];

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

  const [reporte, setReporte] = useState("examen");
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

  // El reporte de bajo rendimiento tiene más columnas: por defecto sale horizontal.
  const orientacion = orientacionElegida ?? (reporte === "bajo" ? "horizontal" : "vertical");

  const opcionesSalida = () => ({
    institucion: institutionName || "",
    logoUrl,
    papel,
    orientacion,
    docente: profile?.full_name || "",
  });

  const imprimir = () => {
    try {
      imprimirHtml(htmlReporte(tabla, opcionesSalida()));
    } catch (e) {
      alert("No se pudo generar el PDF: " + (e?.message || "error desconocido"));
    }
  };

  const exportarExcel = async () => {
    if (exportando) return;
    setExportando(true);
    try {
      const { descargarExcel } = await import("../lib/reportesExcel");
      const base = reporte === "examen" ? "Reporte_deben_examen" : "Reporte_bajo_rendimiento";
      const nombreArchivo = [base, nombreSeguro(nombreDe(subjects, subjectId)), nombreSeguro(`${nombreDe(courses, courseId)}_${nombreDe(parallels, parallelId)}`)]
        .filter(Boolean)
        .join("_");
      await descargarExcel(tabla, { ...opcionesSalida(), nombreArchivo });
    } catch (e) {
      const msg = e?.message || "error desconocido";
      alert("No se pudo generar el Excel: " + msg + (/exceljs|Failed to resolve|import/i.test(msg) ? "\n\nSi es la primera vez, instala la librería con: npm i exceljs" : ""));
    } finally {
      setExportando(false);
    }
  };

  const hayResultados = tabla.filas.length > 0;
  const califMasBaja = bajo.filas.length > 0 ? bajo.filas[0].resumen.calif : "—";

  return (
    <div className="p-4 md:p-8 space-y-5">
      {/* Filtros */}
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
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Trimestre</label>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="">Selecciona…</option>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? " (vigente)" : ""}</option>)}
          </select>
        </div>
      </div>

      {/* Elegir reporte */}
      <div className="grid gap-3 md:grid-cols-2">
        {REPORTES.map((r) => {
          const Icono = r.icono;
          const activo = reporte === r.key;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => setReporte(r.key)}
              aria-pressed={activo}
              className={`flex items-start gap-3 rounded border p-4 text-left transition ${
                activo ? "border-slate-900 bg-white ring-1 ring-slate-900" : "border-slate-200 bg-white hover:border-slate-400"
              }`}
            >
              <Icono className={`h-5 w-5 mt-0.5 ${activo ? "text-slate-900" : "text-slate-400"}`} />
              <span>
                <span className="block text-sm font-semibold text-slate-900">{r.titulo}</span>
                <span className="block text-xs text-slate-500 mt-0.5">{r.descripcion}</span>
              </span>
            </button>
          );
        })}
      </div>

      {!filtrosCompletos && (
        <div className="bg-white border border-slate-200 rounded p-8 text-center text-sm text-slate-500">
          Selecciona materia, curso, paralelo y trimestre para generar el reporte.
        </div>
      )}

      {filtrosCompletos && cargando && (
        <div className="bg-white border border-slate-200 rounded p-8 text-center text-sm text-slate-400">Cargando…</div>
      )}

      {filtrosCompletos && error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {filtrosCompletos && !cargando && !error && (
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
