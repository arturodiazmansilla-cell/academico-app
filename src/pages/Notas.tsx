import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Check, Trash2, Pencil, ChevronDown, Printer, FileText, FileSpreadsheet } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { asegurarTrimestres, trimestresFaltantes } from "../lib/trimestres";
import { Field, Modal } from "../components/ui";

const DIMENSIONES = [
  { key: "ser", label: "SER", max: 10 },
  { key: "saber", label: "SABER", max: 45 },
  { key: "hacer", label: "HACER", max: 40 },
];

// Menú desplegable: botón que abre una lista de opciones y se cierra al elegir una,
// al hacer clic fuera o al pulsar Escape.
function MenuDesplegable({ etiqueta, icono: Icono, opciones, principal = false, deshabilitado = false }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    const alClicFuera = (ev) => { if (ref.current && !ref.current.contains(ev.target)) setAbierto(false); };
    const alTecla = (ev) => { if (ev.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", alClicFuera);
    document.addEventListener("keydown", alTecla);
    return () => {
      document.removeEventListener("mousedown", alClicFuera);
      document.removeEventListener("keydown", alTecla);
    };
  }, [abierto]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        disabled={deshabilitado}
        aria-haspopup="menu"
        aria-expanded={abierto}
        className={`inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-medium disabled:opacity-50 ${
          principal ? "bg-slate-900 text-white hover:bg-slate-800" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        {Icono && <Icono className="h-4 w-4" />}
        {etiqueta}
        <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <div role="menu" className="absolute left-0 top-full z-30 mt-1 min-w-[15rem] rounded border border-slate-200 bg-white py-1 shadow-lg">
          {opciones.map((o) => (
            <button
              key={o.key}
              role="menuitem"
              type="button"
              onClick={() => { setAbierto(false); o.onClick(); }}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              {o.icono && <o.icono className="h-4 w-4 text-slate-400" />}
              {o.texto}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Trimestre que se selecciona por defecto: el marcado como vigente y, si no hay,
// el que contiene la fecha de hoy.
function elegirVigente(periodos) {
  const hoy = new Date().toISOString().slice(0, 10);
  return (
    periodos.find((p) => p.active) ||
    periodos.find((p) => p.start_date && p.start_date <= hoy && (!p.end_date || p.end_date >= hoy)) ||
    null
  );
}

// Una nota es válida si está vacía o es un número ENTERO entre 0 y el máximo del campo.
const esNotaValida = (v, max) =>
  v === "" || v === null || v === undefined || (/^\d+$/.test(String(v)) && Number(v) <= max);

// Filtra lo que se escribe: devuelve el valor a mostrar, o null si se rechaza
// (letras, decimales, negativos o un número mayor al máximo).
const filtrarNota = (raw, max) => {
  if (raw === "") return "";
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n > max ? null : String(n);
};

// En un input numérico el navegador deja escribir e, +, -, . y ,: se bloquean.
const bloquearTeclasNoEnteras = (ev) => {
  if (["e", "E", "+", "-", ".", ","].includes(ev.key)) ev.preventDefault();
};

const hayNota = (v) => v !== "" && v !== null && v !== undefined;
const esVacia = (v) => v === "" || v === undefined || v === null;

// Si true, autoevaluación y proyecto también deben llenarse (mínimo 0) antes de guardar.
// Ponlo en false si en algunas materias no se usan.
const EXIGIR_EXTRAS = true;

const claseNota = (valido, vacia = false) =>
  `w-14 rounded border px-1.5 py-1 text-right focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${
    !valido || vacia ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200"
  }`;

const fmtFecha = (d) => (d ? d.split("-").reverse().join("/") : "—");

export default function Notas() {
  const { user } = useAuth();
  const { institutionName, logoUrl } = useSettings();

  // Filtros
  const [subjects, setSubjects] = useState([]);
  const [courses, setCourses] = useState([]);
  const [parallels, setParallels] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [subjectId, setSubjectId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [parallelId, setParallelId] = useState("");
  const [periodId, setPeriodId] = useState("");

  const [qualitativeRanges, setQualitativeRanges] = useState([]);
  const [students, setStudents] = useState([]);
  const [evaluations, setEvaluations] = useState([]); // actividades, con su dimension
  const [grades, setGrades] = useState({}); // { studentId: { evaluationId: score } }
  const [extras, setExtras] = useState({}); // { studentId: { self_evaluation, project_score } }

  const [cargandoTabla, setCargandoTabla] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showNuevaActividad, setShowNuevaActividad] = useState(null); // dimension key, o null
  const [showTrimestres, setShowTrimestres] = useState(false);
  const [generandoReporte, setGenerandoReporte] = useState(false);
  const [editandoActividad, setEditandoActividad] = useState(null); // actividad (evaluation) que se está editando
  const [actividadAEliminar, setActividadAEliminar] = useState(null); // actividad pendiente de confirmar
  const [eliminando, setEliminando] = useState(false);
  // Candados contra doble clic: el estado de React se actualiza tarde, un ref es inmediato.
  const [filaActiva, setFilaActiva] = useState(null); // alumno cuya fila se está llenando
  const [mostrarVacias, setMostrarVacias] = useState(false); // se activa al intentar guardar con notas vacías
  const guardandoRef = useRef(false);
  const creandoRef = useRef(false);

  useEffect(() => {
    async function cargarBase() {
      const [{ data: subj }, { data: cur }, { data: par }, { data: rangos }] = await Promise.all([
        supabase.from("subjects").select("*").eq("active", true).order("name"),
        supabase.from("courses").select("*").eq("active", true).order("name"),
        supabase.from("parallels").select("*").eq("active", true).order("name"),
        supabase.from("qualitative_ranges").select("*").order("min_score"),
      ]);
      // Crea los trimestres 1, 2 y 3 que falten y deja activo el vigente.
      const { periodos: per } = await asegurarTrimestres(supabase);
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

  async function cargarPeriodos() {
    const { data } = await supabase.from("academic_periods").select("*").order("start_date");
    setPeriods(data || []);
    return data || [];
  }

  // Se llama después de crear, editar, activar o eliminar trimestres.
  async function alCambiarTrimestres() {
    const per = await cargarPeriodos();
    if (!per.some((p) => p.id === periodId)) setPeriodId(elegirVigente(per)?.id || "");
  }

  const paralelosDelCurso = useMemo(() => parallels.filter((p) => p.course_id === courseId), [parallels, courseId]);

  const filtrosCompletos = subjectId && courseId && parallelId && periodId;

  useEffect(() => {
    async function cargarTodo() {
      if (!filtrosCompletos) {
        setStudents([]); setEvaluations([]); setGrades({}); setExtras({});
        return;
      }
      setCargandoTabla(true);

      const [{ data: est }, { data: evals }, { data: term }] = await Promise.all([
        supabase.from("students").select("*").eq("course_id", courseId).eq("parallel_id", parallelId).eq("active", true).order("last_name"),
        supabase.from("evaluations").select("*")
          .eq("subject_id", subjectId).eq("course_id", courseId).eq("parallel_id", parallelId).eq("academic_period_id", periodId)
          .order("evaluation_date"),
        supabase.from("term_extras").select("*")
          .eq("subject_id", subjectId).eq("course_id", courseId).eq("parallel_id", parallelId).eq("academic_period_id", periodId),
      ]);

      const listaEstudiantes = est || [];
      const listaEvals = evals || [];
      setStudents(listaEstudiantes);
      setEvaluations(listaEvals);

      let notas = {};
      if (listaEvals.length > 0) {
        const { data: gradesData } = await supabase.from("grades").select("*").in("evaluation_id", listaEvals.map((e) => e.id));
        (gradesData || []).forEach((g) => {
          notas[g.student_id] = notas[g.student_id] || {};
          notas[g.student_id][g.evaluation_id] = g.score;
        });
      }
      setGrades(notas);

      const mapaExtras = {};
      (term || []).forEach((t) => {
        mapaExtras[t.student_id] = { self_evaluation: t.self_evaluation, project_score: t.project_score };
      });
      setExtras(mapaExtras);

      setCargandoTabla(false);
      setSaved(false);
      setMostrarVacias(false);
      setFilaActiva(null);
    }
    cargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, courseId, parallelId, periodId]);

  const evaluacionesPorDimension = (dim) => evaluations.filter((e) => e.dimension === dim);

  const promedioDimension = (studentId, dim) => {
    const evs = evaluacionesPorDimension(dim);
    const valores = evs
      .map((e) => grades[studentId]?.[e.id])
      .filter((v) => v !== undefined && v !== null && v !== "");
    if (valores.length === 0) return null;
    const suma = valores.reduce((acc, v) => acc + Number(v), 0);
    return Math.round(suma / valores.length);
  };

  const totalDimensiones = (studentId) => {
    let total = 0;
    let hayAlguno = false;
    DIMENSIONES.forEach((d) => {
      const p = promedioDimension(studentId, d.key);
      if (p !== null) { total += p; hayAlguno = true; }
    });
    return hayAlguno ? total : null;
  };

  const calificacionTrimestral = (studentId) => {
    const total = totalDimensiones(studentId);
    if (total === null) return null;
    const auto = Number(extras[studentId]?.self_evaluation ?? 0);
    const proy = Number(extras[studentId]?.project_score ?? 0);
    return total + auto + proy;
  };

  const cualitativo = (valor) => {
    if (valor === null || valor === undefined) return null;
    const rango = qualitativeRanges.find((r) => valor >= Number(r.min_score) && valor <= Number(r.max_score));
    return rango || null;
  };

  async function obtenerNombreMaestro() {
    try {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      const nombre = data?.full_name || data?.name || data?.nombre || [data?.first_name, data?.last_name].filter(Boolean).join(" ");
      if (nombre) return nombre;
    } catch (e) { /* se usa el respaldo */ }
    return user?.user_metadata?.full_name || user?.email || "";
  }

  // Arma el "Reporte de Calificación" con lo que hay en pantalla (mismos promedios y totales)
  // y lo descarga. formato: "pdf" | "xls"; papel: "carta" | "oficio". Siempre en horizontal.
  async function imprimirCalificacion(formato, papel) {
    if (generandoReporte) return;
    setGenerandoReporte(true);
    try {
      const nombreDe = (lista, id) => lista.find((x) => x.id === id)?.name || "";
      const maestro = await obtenerNombreMaestro();
      const datos = {
        institucion: institutionName || "",
        anio: `${nombreDe(courses, courseId)} ${nombreDe(parallels, parallelId)}`.trim(),
        materia: nombreDe(subjects, subjectId),
        trimestre: nombreDe(periods, periodId),
        maestro,
        dimensiones: DIMENSIONES.map((d) => ({
          label: d.label,
          max: d.max,
          evaluaciones: evaluacionesPorDimension(d.key).map((e) => ({ title: e.title, fecha: e.evaluation_date })),
        })),
        filas: students.map((st) => {
          const calif = calificacionTrimestral(st.id);
          return {
            nombre: `${st.last_name}, ${st.first_name}`,
            dims: DIMENSIONES.map((d) => ({
              notas: evaluacionesPorDimension(d.key).map((e) => grades[st.id]?.[e.id] ?? null),
              prom: promedioDimension(st.id, d.key),
            })),
            autoev: extras[st.id]?.self_evaluation ?? null,
            proyecto: extras[st.id]?.project_score ?? null,
            total: totalDimensiones(st.id),
            calif,
            cual: cualitativo(calif)?.label ?? "",
          };
        }),
      };
      const { descargarReporte } = await import("../lib/reporteCalificaciones");
      await descargarReporte(formato, papel, datos, logoUrl);
    } catch (err) {
      alert("No se pudo generar el reporte: " + (err?.message || "error desconocido"));
    } finally {
      setGenerandoReporte(false);
    }
  }

  // Enter pasa a la casilla siguiente: baja al alumno de abajo en la misma columna y, al llegar
  // al último alumno, salta al primer alumno de la columna siguiente (actividades, autoev., proyecto).
  const irASiguienteCasilla = (studentId, colKey) => {
    const columnas = [
      ...DIMENSIONES.flatMap((d) => evaluacionesPorDimension(d.key).map((e) => e.id)),
      "self_evaluation",
      "project_score",
    ];
    const fila = students.findIndex((st) => st.id === studentId);
    const col = columnas.indexOf(colKey);
    let destinoAlumno = null;
    let destinoCol = null;
    if (fila < students.length - 1) {
      destinoAlumno = students[fila + 1].id;
      destinoCol = colKey;
    } else if (col < columnas.length - 1) {
      destinoAlumno = students[0].id;
      destinoCol = columnas[col + 1];
    }
    if (destinoAlumno === null) {
      document.activeElement?.blur(); // fin de la planilla
      return;
    }
    document.getElementById(`nota-${destinoAlumno}-${destinoCol}`)?.focus();
  };

  const manejarTecla = (ev, studentId, colKey) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      irASiguienteCasilla(studentId, colKey);
      return;
    }
    bloquearTeclasNoEnteras(ev);
  };

  const alumnoTieneVacias = (st) =>
    DIMENSIONES.some((d) => evaluacionesPorDimension(d.key).some((e) => esVacia(grades[st.id]?.[e.id]))) ||
    (EXIGIR_EXTRAS && (esVacia(extras[st.id]?.self_evaluation) || esVacia(extras[st.id]?.project_score)));

  const setGrade = (studentId, evaluationId, valor) => {
    setGrades((prev) => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), [evaluationId]: valor } }));
    setSaved(false);
  };

  const setExtra = (studentId, campo, valor) => {
    setExtras((prev) => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), [campo]: valor } }));
    setSaved(false);
  };

  const crearActividad = async ({ titulo, fecha }, dimension) => {
    if (creandoRef.current) return; // ya se está creando: ignora el segundo clic
    const yaExiste = evaluations.some(
      (e) =>
        e.dimension === dimension &&
        (e.title || "").trim().toLowerCase() === titulo.trim().toLowerCase() &&
        e.evaluation_date === fecha
    );
    if (yaExiste) {
      alert("Ya existe una actividad con ese título y esa fecha en esta dimensión.");
      return;
    }
    creandoRef.current = true;
    try {
      const max = DIMENSIONES.find((d) => d.key === dimension).max;
      const { error } = await supabase.from("evaluations").insert({
        subject_id: subjectId, teacher_id: user.id, course_id: courseId, parallel_id: parallelId,
        academic_period_id: periodId, dimension, title: titulo, evaluation_date: fecha, maximum_score: max,
      });
      setShowNuevaActividad(null);
      if (!error) {
        const { data: evals } = await supabase.from("evaluations").select("*")
          .eq("subject_id", subjectId).eq("course_id", courseId).eq("parallel_id", parallelId).eq("academic_period_id", periodId)
          .order("evaluation_date");
        setEvaluations(evals || []);
      } else {
        alert(error.code === "23505" ? "Esa actividad ya existe." : "No se pudo crear la actividad: " + error.message);
      }
    } finally {
      creandoRef.current = false;
    }
  };

  // Cambia el título y/o la fecha de una actividad. Las notas ya cargadas no se tocan.
  const editarActividad = async ({ titulo, fecha }, actividad) => {
    if (creandoRef.current) return;
    const repetida = evaluations.some(
      (e) =>
        e.id !== actividad.id &&
        e.dimension === actividad.dimension &&
        (e.title || "").trim().toLowerCase() === titulo.trim().toLowerCase() &&
        e.evaluation_date === fecha
    );
    if (repetida) {
      alert("Ya existe otra actividad con ese título y esa fecha en esta dimensión.");
      return;
    }
    creandoRef.current = true;
    try {
      const { error } = await supabase.from("evaluations").update({ title: titulo, evaluation_date: fecha }).eq("id", actividad.id);
      if (error) {
        alert(error.code === "23505" ? "Ya existe otra actividad igual." : "No se pudieron guardar los cambios: " + error.message);
        return;
      }
      setEvaluations((prev) =>
        prev
          .map((e) => (e.id === actividad.id ? { ...e, title: titulo, evaluation_date: fecha } : e))
          .sort((a, b) => String(a.evaluation_date).localeCompare(String(b.evaluation_date)))
      );
      setEditandoActividad(null);
    } finally {
      creandoRef.current = false;
    }
  };

  // Se ejecuta solo cuando el profesor responde "Sí" en el cuadro de confirmación.
  const eliminarActividad = async () => {
    const actividad = actividadAEliminar;
    if (!actividad || eliminando) return;
    setEliminando(true);
    try {
      const { error } = await supabase.from("evaluations").delete().eq("id", actividad.id);
      if (error) {
        alert("No se pudo eliminar la actividad: " + error.message);
        return;
      }
      setEvaluations((prev) => prev.filter((e) => e.id !== actividad.id));
      setGrades((prev) => {
        const copia = {};
        Object.entries(prev).forEach(([studentId, porEvaluacion]) => {
          const { [actividad.id]: _quitada, ...resto } = porEvaluacion;
          copia[studentId] = resto;
        });
        return copia;
      });
      setActividadAEliminar(null);
    } finally {
      setEliminando(false);
    }
  };

  const guardarTodo = async () => {
    if (guardandoRef.current) return; // ya se está guardando: ignora el segundo clic
    // Red de seguridad: no se guarda nada si alguna nota no es un entero dentro de su rango
    // (por ejemplo, valores que ya estaban guardados fuera de rango).
    const maxPorEvaluacion = Object.fromEntries(evaluations.map((e) => [e.id, Number(e.maximum_score)]));
    let invalidas = 0;
    Object.values(grades).forEach((porEvaluacion) =>
      Object.entries(porEvaluacion).forEach(([evaluationId, score]) => {
        if (evaluationId in maxPorEvaluacion && !esNotaValida(score, maxPorEvaluacion[evaluationId])) invalidas++;
      })
    );
    Object.values(extras).forEach((x) => {
      if (!esNotaValida(x?.self_evaluation, 5)) invalidas++;
      if (!esNotaValida(x?.project_score, 5)) invalidas++;
    });
    if (invalidas > 0) {
      alert(`Hay ${invalidas} nota(s) inválida(s), marcadas en rojo. Deben ser números enteros entre 0 y el máximo de cada campo.`);
      return;
    }

    // Las casillas vacías NO bloquean el guardado (el profesor puede completarlas después,
    // por ejemplo si un alumno faltó al examen): se guardan las notas ingresadas y las
    // vacías quedan marcadas en rojo como pendientes hasta que se llenen.
    const vacias = [];
    students.forEach((st) => {
      const alumno = `${st.first_name} ${st.last_name}`;
      DIMENSIONES.forEach((d) =>
        evaluacionesPorDimension(d.key).forEach((e) => {
          if (esVacia(grades[st.id]?.[e.id])) vacias.push({ id: `nota-${st.id}-${e.id}`, alumno });
        })
      );
      if (EXIGIR_EXTRAS) {
        ["self_evaluation", "project_score"].forEach((campo) => {
          if (esVacia(extras[st.id]?.[campo])) vacias.push({ id: `nota-${st.id}-${campo}`, alumno });
        });
      }
    });
    setMostrarVacias(vacias.length > 0);

    guardandoRef.current = true;
    setGuardando(true);
    setSaved(false);
    try {
      const registrosGrades = [];
      Object.entries(grades).forEach(([studentId, porEvaluacion]) => {
        Object.entries(porEvaluacion).forEach(([evaluationId, score]) => {
          if (score === "" || score === null || score === undefined) return;
          registrosGrades.push({ student_id: studentId, evaluation_id: evaluationId, score: Number(score), registered_by: user.id, updated_at: new Date().toISOString() });
        });
      });
      if (registrosGrades.length > 0) {
        // upsert: si ya existe la nota de ese alumno en esa actividad, la actualiza en vez de duplicarla.
        const { error } = await supabase.from("grades").upsert(registrosGrades, { onConflict: "evaluation_id,student_id" });
        if (error) throw error;
      }

      const valorExtra = (v) => (v === "" || v === undefined || v === null ? null : Number(v));
      const registrosExtras = students.map((s) => ({
        student_id: s.id, subject_id: subjectId, course_id: courseId, parallel_id: parallelId, academic_period_id: periodId,
        self_evaluation: valorExtra(extras[s.id]?.self_evaluation),
        project_score: valorExtra(extras[s.id]?.project_score),
        updated_at: new Date().toISOString(),
      }));
      const { error: errExtras } = await supabase.from("term_extras").upsert(registrosExtras, { onConflict: "student_id,subject_id,course_id,parallel_id,academic_period_id" });
      if (errExtras) throw errExtras;

      setSaved(true);
      if (vacias.length > 0) {
        const alumnosPendientes = new Set(vacias.map((v) => v.alumno)).size;
        alert(
          `Notas guardadas.\n\nQuedan ${vacias.length} nota(s) sin registrar en ${alumnosPendientes} alumno(s), marcadas en rojo. ` +
          `Puedes completarlas más tarde; el rojo desaparece cuando ingreses la nota.`
        );
      }
    } catch (err) {
      alert("No se pudieron guardar las notas: " + (err?.message || "error desconocido"));
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
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
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-slate-600">Trimestre</label>
            <button type="button" onClick={() => setShowTrimestres(true)} className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1">
              <Plus className="h-3 w-3" /> Gestionar
            </button>
          </div>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="">Selecciona…</option>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? " (vigente)" : ""}</option>)}
          </select>
          {periods.length === 0 && (
            <p className="text-[11px] text-amber-700 mt-1">
              No hay trimestres. Usa “Gestionar” para crearlos.
            </p>
          )}
        </div>
      </div>

      {!filtrosCompletos && (
        <div className="bg-white border border-slate-200 rounded p-8 text-center text-sm text-slate-400">
          Selecciona materia, curso, paralelo y trimestre para ver la planilla de notas.
        </div>
      )}

      {filtrosCompletos && cargandoTabla && <p className="text-sm text-slate-400">Cargando…</p>}

      {filtrosCompletos && !cargandoTabla && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <MenuDesplegable
              principal
              icono={Plus}
              etiqueta="Agregar Notas"
              opciones={DIMENSIONES.map((d) => ({
                key: d.key,
                texto: `Actividad del ${d.label} (Máx ${d.max})`,
                onClick: () => setShowNuevaActividad(d.key),
              }))}
            />
            <MenuDesplegable
              icono={Printer}
              etiqueta={generandoReporte ? "Generando reporte…" : "Imprimir Calificación"}
              deshabilitado={generandoReporte || students.length === 0}
              opciones={[
                { key: "pdf-carta", texto: "En PDF Tamaño Carta", icono: FileText, onClick: () => imprimirCalificacion("pdf", "carta") },
                { key: "xls-carta", texto: "En XLS Tamaño Carta", icono: FileSpreadsheet, onClick: () => imprimirCalificacion("xls", "carta") },
                { key: "pdf-oficio", texto: "En PDF Tamaño Oficio", icono: FileText, onClick: () => imprimirCalificacion("pdf", "oficio") },
                { key: "xls-oficio", texto: "En XLS Tamaño Oficio", icono: FileSpreadsheet, onClick: () => imprimirCalificacion("xls", "oficio") },
              ]}
            />
          </div>

          <div className="bg-white border border-slate-200 rounded overflow-x-auto">
            <table className="text-xs md:text-sm border-collapse min-w-full">
              <thead>
                <tr>
                  <th rowSpan={2} className="sticky left-0 bg-white px-3 py-2 text-left font-medium text-slate-600 border-b border-r border-slate-200 min-w-[180px]">
                    Alumno
                  </th>
                  {DIMENSIONES.map((d) => (
                    <th key={d.key} colSpan={evaluacionesPorDimension(d.key).length + 1} className="px-2 py-1.5 text-center font-medium text-slate-500 border-b border-slate-200 bg-slate-50">
                      {d.label} / {d.max}
                    </th>
                  ))}
                  <th rowSpan={2} className="px-2 py-2 text-center font-medium text-slate-500 border-b border-l border-slate-200 bg-amber-50">AUTOEV / 5</th>
                  <th rowSpan={2} className="px-2 py-2 text-center font-medium text-slate-500 border-b border-slate-200 bg-amber-50">PROYECTO / 5</th>
                  <th rowSpan={2} className="px-2 py-2 text-center font-medium text-slate-700 border-b border-slate-200 bg-slate-100">TOTAL</th>
                  <th rowSpan={2} className="px-2 py-2 text-center font-medium text-slate-700 border-b border-slate-200 bg-emerald-50">CALIF. TRIM.</th>
                  <th rowSpan={2} className="px-2 py-2 text-center font-medium text-slate-700 border-b border-slate-200 bg-emerald-50">CUALIT.</th>
                </tr>
                <tr>
                  {DIMENSIONES.map((d) => (
                    <>
                      {evaluacionesPorDimension(d.key).map((e) => (
                        <th key={e.id} className="px-2 py-1.5 border-b border-slate-200 font-normal text-slate-500 align-top">
                          <div className="flex flex-col items-center gap-0.5 w-24 mx-auto">
                            <span className="whitespace-normal break-words text-center leading-snug">{e.title}</span>
                            <span className="text-[10px] text-slate-400">{e.evaluation_date || "Sin fecha"}</span>
                            <div className="flex items-center gap-2">
                              <button onClick={() => setEditandoActividad(e)} className="text-slate-300 hover:text-emerald-700" title="Editar actividad" aria-label="Editar actividad">
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button onClick={() => setActividadAEliminar(e)} className="text-slate-300 hover:text-red-600" title="Eliminar actividad" aria-label="Eliminar actividad">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </th>
                      ))}
                      <th key={d.key + "-prom"} className="px-2 py-1.5 border-b border-l border-slate-200 font-medium text-slate-600 bg-slate-50">PROM.</th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((s) => {
                  const total = totalDimensiones(s.id);
                  const califTrim = calificacionTrimestral(s.id);
                  const cual = cualitativo(califTrim);
                  const activa = filaActiva === s.id;
                  // Después de intentar guardar, la fila completa del alumno con notas pendientes se marca en rojo.
                  const pendiente = !activa && mostrarVacias && alumnoTieneVacias(s);
                  const sinFondo = activa || pendiente; // las celdas con fondo propio dejan ver el color de la fila
                  return (
                    <tr key={s.id} className={activa ? "bg-amber-100" : pendiente ? "bg-red-50" : "hover:bg-slate-50/60"}>
                      <td className={`sticky left-0 px-3 py-2 border-r border-slate-100 border-l-4 whitespace-nowrap ${
                        activa ? "bg-amber-100 border-l-amber-500 font-semibold text-slate-900"
                        : pendiente ? "bg-red-50 border-l-red-400 font-medium text-red-800"
                        : "bg-white border-l-transparent"}`}>
                        {s.first_name} {s.last_name}
                      </td>
                      {DIMENSIONES.map((d) => (
                        <>
                          {evaluacionesPorDimension(d.key).map((e) => (
                            <td key={e.id} className="px-1 py-1">
                              <input
                                id={`nota-${s.id}-${e.id}`}
                                type="number" min="0" max={e.maximum_score} step="1" inputMode="numeric"
                                value={grades[s.id]?.[e.id] ?? ""}
                                onFocus={(ev) => { setFilaActiva(s.id); ev.target.select(); }}
                                onKeyDown={(ev) => manejarTecla(ev, s.id, e.id)}
                                onChange={(ev) => {
                                  const v = filtrarNota(ev.target.value, Number(e.maximum_score));
                                  if (v !== null) setGrade(s.id, e.id, v);
                                }}
                                className={claseNota(esNotaValida(grades[s.id]?.[e.id], Number(e.maximum_score)), mostrarVacias && esVacia(grades[s.id]?.[e.id]))}
                                title={`Entero de 0 a ${Number(e.maximum_score)}`}
                              />
                            </td>
                          ))}
                          <td key={d.key + "-prom-" + s.id} className={`px-2 py-1 text-center font-medium text-slate-700 border-l border-slate-100 ${sinFondo ? "" : "bg-slate-50/50"}`}>
                            {promedioDimension(s.id, d.key) ?? "—"}
                          </td>
                        </>
                      ))}
                      <td className="px-1 py-1 border-l border-slate-100">
                        <input
                          id={`nota-${s.id}-self_evaluation`}
                          type="number" min="0" max="5" step="1" inputMode="numeric"
                          value={extras[s.id]?.self_evaluation ?? ""}
                          onFocus={(ev) => { setFilaActiva(s.id); ev.target.select(); }}
                          onKeyDown={(ev) => manejarTecla(ev, s.id, "self_evaluation")}
                          onChange={(ev) => {
                            const v = filtrarNota(ev.target.value, 5);
                            if (v !== null) setExtra(s.id, "self_evaluation", v);
                          }}
                          className={claseNota(esNotaValida(extras[s.id]?.self_evaluation, 5), EXIGIR_EXTRAS && mostrarVacias && esVacia(extras[s.id]?.self_evaluation))}
                          title="Entero de 0 a 5"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          id={`nota-${s.id}-project_score`}
                          type="number" min="0" max="5" step="1" inputMode="numeric"
                          value={extras[s.id]?.project_score ?? ""}
                          onFocus={(ev) => { setFilaActiva(s.id); ev.target.select(); }}
                          onKeyDown={(ev) => manejarTecla(ev, s.id, "project_score")}
                          onChange={(ev) => {
                            const v = filtrarNota(ev.target.value, 5);
                            if (v !== null) setExtra(s.id, "project_score", v);
                          }}
                          className={claseNota(esNotaValida(extras[s.id]?.project_score, 5), EXIGIR_EXTRAS && mostrarVacias && esVacia(extras[s.id]?.project_score))}
                          title="Entero de 0 a 5"
                        />
                      </td>
                      <td className={`px-2 py-1 text-center font-medium ${sinFondo ? "" : "bg-slate-50"}`}>{total ?? "—"}</td>
                      <td className={`px-2 py-1 text-center font-semibold ${sinFondo ? "" : "bg-emerald-50/60"}`}>{califTrim ?? "—"}</td>
                      <td className={`px-2 py-1 text-center ${sinFondo ? "" : "bg-emerald-50/60"}`}>{cual?.label ?? "—"}</td>
                    </tr>
                  );
                })}
                {students.length === 0 && (
                  <tr><td colSpan={20} className="p-6 text-center text-slate-400">No hay alumnos activos en este curso y paralelo.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-3">
            {saved && <span className="text-xs text-emerald-700 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Notas guardadas</span>}
            <button onClick={guardarTodo} disabled={guardando} className="inline-flex items-center gap-2 rounded bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {guardando ? "Guardando…" : "Guardar notas"}
            </button>
          </div>
        </>
      )}

      {showTrimestres && (
        <TrimestresModal
          periods={periods}
          onClose={() => setShowTrimestres(false)}
          onChanged={alCambiarTrimestres}
        />
      )}
      {showNuevaActividad && (
        <NuevaActividadModal
          dimension={DIMENSIONES.find((d) => d.key === showNuevaActividad)}
          onClose={() => setShowNuevaActividad(null)}
          onSave={(datos) => crearActividad(datos, showNuevaActividad)}
        />
      )}
      {actividadAEliminar && (
        <Modal
          title="Eliminar actividad"
          onClose={() => { if (!eliminando) setActividadAEliminar(null); }}
          maxWidth="sm:max-w-md"
          footer={
            <>
              <button
                autoFocus
                onClick={() => setActividadAEliminar(null)}
                disabled={eliminando}
                className="text-sm border border-slate-300 text-slate-700 px-5 py-2 rounded hover:bg-slate-50 disabled:opacity-50"
              >
                No
              </button>
              <button
                onClick={eliminarActividad}
                disabled={eliminando}
                className="text-sm bg-red-600 text-white px-5 py-2 rounded hover:bg-red-700 disabled:opacity-50"
              >
                {eliminando ? "Eliminando…" : "Sí"}
              </button>
            </>
          }
        >
          {(() => {
            const conNota = Object.values(grades).filter((porEval) => hayNota(porEval?.[actividadAEliminar.id])).length;
            return (
              <div className="space-y-3 text-sm text-slate-700">
                <p>¿Está seguro de que desea eliminar esta actividad?</p>
                <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="font-medium">{actividadAEliminar.title}</span>
                  <span className="block text-xs text-slate-500">{fmtFecha(actividadAEliminar.evaluation_date)}</span>
                </p>
                <p className="text-red-700">
                  {conNota > 0
                    ? `Se borrarán también las ${conNota} nota(s) cargadas en ella. Esta acción no se puede deshacer.`
                    : "Esta acción no se puede deshacer."}
                </p>
              </div>
            );
          })()}
        </Modal>
      )}
      {editandoActividad && (
        <NuevaActividadModal
          key={editandoActividad.id}
          dimension={DIMENSIONES.find((d) => d.key === editandoActividad.dimension)}
          actividad={editandoActividad}
          onClose={() => setEditandoActividad(null)}
          onSave={(datos) => editarActividad(datos, editandoActividad)}
        />
      )}
    </div>
  );
}

function NuevaActividadModal({ dimension, onClose, onSave, actividad = null }) {
  const editando = !!actividad;
  // Solo SER admite guardar la actividad sin fecha (por ejemplo, actividades actitudinales
  // sin una fecha puntual). SABER y HACER siguen exigiendo fecha como antes.
  const fechaOpcional = dimension.key === "ser";
  const [titulo, setTitulo] = useState(actividad?.title ?? "");
  const [fecha, setFecha] = useState(() => actividad?.evaluation_date ?? (fechaOpcional ? "" : new Date().toISOString().slice(0, 10)));

  const [enviando, setEnviando] = useState(false);

  const guardar = async () => {
    if (!titulo.trim() || enviando) return;
    if (!fechaOpcional && !fecha) return; // SABER/HACER: la fecha sigue siendo obligatoria
    setEnviando(true);
    try {
      await onSave({ titulo: titulo.trim(), fecha: fecha || null });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal title={`${editando ? "Editar" : "Nueva"} actividad de ${dimension.label} (sobre ${dimension.max} pts)`} onClose={onClose} maxWidth="sm:max-w-md"
      footer={
        <>
          <button onClick={onClose} className="text-sm text-slate-600 px-4 py-2">Cancelar</button>
          <button onClick={guardar} disabled={enviando} className="text-sm bg-slate-900 text-white px-4 py-2 rounded hover:bg-slate-800 disabled:opacity-50">{enviando ? (editando ? "Guardando…" : "Creando…") : editando ? "Guardar cambios" : "Crear actividad"}</button>
        </>
      }
    >
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Título / descripción</label>
        <textarea
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ej. Examen tema 3"
          required
          rows={4}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 resize-y"
        />
      </div>
      <Field
        label={fechaOpcional ? "Fecha (opcional)" : "Fecha"}
        type="date"
        value={fecha}
        onChange={setFecha}
        required={!fechaOpcional}
      />
      <p className="text-xs text-slate-400">
        {editando
          ? "Cambiar el título o la fecha no modifica las notas ya cargadas. Si cambias la fecha, la actividad puede cambiar de lugar en la planilla."
          : `Se califica directamente sobre ${dimension.max} puntos. El promedio de ${dimension.label} es el promedio simple de todas sus actividades.`}
        {fechaOpcional && " En SER puedes dejar la fecha en blanco si la actividad no corresponde a un día puntual."}
      </p>
    </Modal>
  );
}

function TrimestresModal({ periods, onClose, onChanged }) {
  const [editId, setEditId] = useState(null);
  const [nombre, setNombre] = useState("");
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [vigente, setVigente] = useState(false);
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const limpiar = () => {
    setEditId(null); setNombre(""); setInicio(""); setFin(""); setVigente(false); setError("");
  };

  const editar = (p) => {
    setEditId(p.id); setNombre(p.name || ""); setInicio(p.start_date || ""); setFin(p.end_date || "");
    setVigente(!!p.active); setError("");
  };

  const mensajeError = (err) => {
    if (err?.code === "23503") return "No se puede eliminar: ya tiene actividades o notas registradas.";
    if (err?.code === "23505") return "Ya existe un trimestre con ese nombre.";
    return err?.message || "Ocurrió un error inesperado.";
  };

  const validar = () => {
    if (!nombre.trim()) return "Escribe el nombre del trimestre.";
    if (!inicio || !fin) return "Indica la fecha de inicio y la de fin.";
    if (fin < inicio) return "La fecha de fin no puede ser anterior a la de inicio.";
    const anioNuevo = Number(inicio.slice(0, 4));
    const repetido = periods.find((p) => p.id !== editId && p.year === anioNuevo && (p.name || "").trim().toLowerCase() === nombre.trim().toLowerCase());
    if (repetido) return "Ya existe un trimestre con ese nombre en esa gestión.";
    const cruzado = periods.find((p) => p.id !== editId && p.start_date && p.end_date && inicio <= p.end_date && fin >= p.start_date);
    if (cruzado) return `Las fechas se cruzan con "${cruzado.name}".`;
    return "";
  };

  const guardar = async () => {
    const msg = validar();
    if (msg) { setError(msg); return; }
    setGuardando(true);
    setError("");
    try {
      // El primer trimestre que se crea queda como vigente automáticamente.
      const quedaVigente = vigente || (!editId && periods.length === 0);
      if (quedaVigente) {
        const { error: e0 } = await supabase.from("academic_periods").update({ active: false }).eq("active", true);
        if (e0) throw e0;
      }
      // year es NOT NULL en la tabla: se toma del año de la fecha de inicio.
      const datos = { name: nombre.trim(), year: Number(inicio.slice(0, 4)), start_date: inicio, end_date: fin, active: quedaVigente };
      const { error: e1 } = editId
        ? await supabase.from("academic_periods").update(datos).eq("id", editId)
        : await supabase.from("academic_periods").insert(datos);
      if (e1) throw e1;
      limpiar();
      await onChanged();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const marcarVigente = async (p) => {
    setError("");
    const { error: e0 } = await supabase.from("academic_periods").update({ active: false }).eq("active", true);
    if (e0) { setError(mensajeError(e0)); return; }
    const { error: e1 } = await supabase.from("academic_periods").update({ active: true }).eq("id", p.id);
    if (e1) { setError(mensajeError(e1)); return; }
    await onChanged();
  };

  const eliminar = async (p) => {
    if (!window.confirm(`¿Eliminar "${p.name}"? Esta acción no se puede deshacer.`)) return;
    setError("");
    const { error: e0 } = await supabase.from("academic_periods").delete().eq("id", p.id);
    if (e0) { setError(mensajeError(e0)); return; }
    if (editId === p.id) limpiar();
    await onChanged();
  };

  // Atajo: crea los tres trimestres de una gestión. Las fechas son aproximadas y se pueden editar.
  const crearTres = async () => {
    const y = Number(anio);
    if (!y || y < 2000 || y > 2100) { setError("Escribe un año válido."); return; }
    const nuevos = trimestresFaltantes(periods, y);
    if (nuevos.length === 0) { setError(`Los trimestres de ${y} ya existen.`); return; }
    setGuardando(true);
    setError("");
    const hayVigente = periods.some((p) => p.active);
    const { error: e0 } = await supabase
      .from("academic_periods")
      .insert(nuevos.map((t, i) => ({ ...t, active: !hayVigente && i === 0 })));
    setGuardando(false);
    if (e0) { setError(mensajeError(e0)); return; }
    await onChanged();
  };

  return (
    <Modal
      title="Trimestres"
      onClose={onClose}
      maxWidth="sm:max-w-2xl"
      footer={<button onClick={onClose} className="text-sm text-slate-600 px-4 py-2">Cerrar</button>}
    >
      <div className="border border-slate-200 rounded divide-y divide-slate-100">
        {periods.length === 0 && <p className="p-4 text-sm text-slate-400 text-center">Aún no hay trimestres registrados.</p>}
        {periods.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-800 flex items-center gap-2">
                {p.name}
                {p.active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Vigente</span>}
              </p>
              <p className="text-xs text-slate-500">{fmtFecha(p.start_date)} — {fmtFecha(p.end_date)}</p>
            </div>
            {!p.active && <button onClick={() => marcarVigente(p)} className="text-xs text-emerald-700 hover:underline">Marcar vigente</button>}
            <button onClick={() => editar(p)} className="text-slate-400 hover:text-slate-700" title="Editar"><Pencil className="h-4 w-4" /></button>
            <button onClick={() => eliminar(p)} className="text-slate-400 hover:text-red-600" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>

      <div className="border border-slate-200 rounded p-4 space-y-3">
        <p className="text-sm font-medium text-slate-700">{editId ? "Editar trimestre" : "Nuevo trimestre"}</p>
        <Field label="Nombre" value={nombre} onChange={setNombre} placeholder="Ej. 1er Trimestre 2026" required />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Inicio" type="date" value={inicio} onChange={setInicio} required />
          <Field label="Fin" type="date" value={fin} onChange={setFin} required />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={vigente} onChange={(e) => setVigente(e.target.checked)} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600" />
          Marcar como trimestre vigente (el que se abre por defecto en Notas)
        </label>
        <div className="flex items-center gap-3">
          <button onClick={guardar} disabled={guardando} className="text-sm bg-slate-900 text-white px-4 py-2 rounded hover:bg-slate-800 disabled:opacity-50">
            {guardando ? "Guardando…" : editId ? "Guardar cambios" : "Crear trimestre"}
          </button>
          {editId && <button onClick={limpiar} className="text-sm text-slate-500 hover:underline">Cancelar edición</button>}
        </div>
      </div>

      {!editId && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Atajo: crear los 3 trimestres de la gestión</span>
          <input
            type="number"
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
            className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
          />
          <button onClick={crearTres} disabled={guardando} className="rounded border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Crear
          </button>
          <span className="text-slate-400">(fechas aproximadas, edítalas después)</span>
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
    </Modal>
  );
}
