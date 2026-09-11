import { useEffect, useMemo, useState } from "react";
import { Plus, Check } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { Field, Modal } from "../components/ui";

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

  const [evaluaciones, setEvaluaciones] = useState([]);
  const [evaluacionId, setEvaluacionId] = useState("");
  const [notas, setNotas] = useState({}); // { studentId: score }
  const [notasTodas, setNotasTodas] = useState([]); // todas las notas de las evaluaciones filtradas (para promedios)

  const [showNueva, setShowNueva] = useState(false);
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
      if (!data.find((e) => e.id === evaluacionId)) setEvaluacionId(data[0].id);
      const { data: todasNotas } = await supabase.from("grades").select("*").in("evaluation_id", data.map((e) => e.id));
      setNotasTodas(todasNotas || []);
    } else {
      setEvaluacionId("");
      setNotasTodas([]);
    }
  }

  useEffect(() => {
    cargarEvaluaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, courseId, parallelId]);

  useEffect(() => {
    async function cargarNotasEvaluacion() {
      if (!evaluacionId) { setNotas({}); return; }
      const { data } = await supabase.from("grades").select("*").eq("evaluation_id", evaluacionId);
      const mapa = {};
      (data || []).forEach((n) => { mapa[n.student_id] = n.score ?? ""; });
      setNotas(mapa);
      setSaved(false);
    }
    cargarNotasEvaluacion();
  }, [evaluacionId]);

  const evaluacionActual = evaluaciones.find((e) => e.id === evaluacionId);

  const promedioPonderado = (studentId) => {
    let suma = 0, pesoTotal = 0;
    evaluaciones.forEach((ev) => {
      const nota = notasTodas.find((n) => n.student_id === studentId && n.evaluation_id === ev.id);
      if (nota && nota.score !== null && nota.score !== undefined) {
        suma += (Number(nota.score) / Number(ev.maximum_score || 1)) * Number(ev.weight || 0);
        pesoTotal += Number(ev.weight || 0);
      }
    });
    if (pesoTotal === 0) return null;
    return (suma / pesoTotal) * 100;
  };

  const guardarNotas = async () => {
    if (!evaluacionId) return;
    setGuardando(true);
    const registros = Object.entries(notas)
      .filter(([, score]) => score !== "" && score !== null && score !== undefined)
      .map(([studentId, score]) => ({
        evaluation_id: evaluacionId, student_id: studentId, score: Number(score), registered_by: user.id,
        updated_at: new Date().toISOString(),
      }));
    if (registros.length > 0) {
      await supabase.from("grades").upsert(registros, { onConflict: "evaluation_id,student_id" });
    }
    await cargarEvaluaciones();
    setGuardando(false);
    setSaved(true);
  };

  const crearEvaluacion = async ({ titulo, evaluationTypeId, fecha, puntajeMax, ponderacion }) => {
    const { data, error } = await supabase.from("evaluations").insert({
      subject_id: subjectId, teacher_id: user.id, course_id: courseId, parallel_id: parallelId,
      evaluation_type_id: evaluationTypeId || null, title: titulo, evaluation_date: fecha,
      maximum_score: puntajeMax, weight: ponderacion,
    }).select().single();
    if (!error) {
      setShowNueva(false);
      await cargarEvaluaciones();
      setEvaluacionId(data.id);
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
        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">Evaluaciones</p>
              <button onClick={() => setShowNueva(true)} className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline">
                <Plus className="h-3.5 w-3.5" /> Nueva evaluación
              </button>
            </div>
            <div className="bg-white border border-slate-200 rounded divide-y divide-slate-100">
              {evaluaciones.map((e) => (
                <button key={e.id} onClick={() => setEvaluacionId(e.id)}
                  className={`w-full text-left p-3.5 hover:bg-slate-50 ${evaluacionId === e.id ? "bg-emerald-50/60 border-l-2 border-emerald-600" : "border-l-2 border-transparent"}`}>
                  <p className="text-sm text-slate-800">{e.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{e.evaluation_date} · {e.weight}% · máx {e.maximum_score} pts</p>
                </button>
              ))}
              {evaluaciones.length === 0 && <p className="p-6 text-sm text-slate-400 text-center">Sin evaluaciones para este filtro todavía.</p>}
            </div>

            <p className="text-xs text-slate-500 pt-2">Promedio ponderado</p>
            <div className="bg-white border border-slate-200 rounded divide-y divide-slate-100">
              {students.map((s) => {
                const prom = promedioPonderado(s.id);
                return (
                  <div key={s.id} className="p-3 flex items-center justify-between text-sm">
                    <span className="text-slate-700">{s.first_name} {s.last_name}</span>
                    <span className={`font-medium ${prom !== null && prom < 51 ? "text-red-700" : "text-slate-800"}`}>{prom !== null ? prom.toFixed(1) : "—"}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-3 space-y-3">
            {evaluacionActual ? (
              <>
                <div className="bg-white border border-slate-200 rounded p-4">
                  <p className="font-ledger text-base font-semibold text-slate-900">{evaluacionActual.title}</p>
                  <p className="text-xs text-slate-500 mt-1">{evaluacionActual.evaluation_date} · Ponderación {evaluacionActual.weight}% · Puntaje máximo {evaluacionActual.maximum_score}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded divide-y divide-slate-100">
                  {students.map((s) => (
                    <div key={s.id} className="p-3.5 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-800">{s.first_name} {s.last_name}</p>
                        <p className="text-xs text-slate-500">{s.student_code || "s/código"}</p>
                      </div>
                      <input
                        type="number" min="0" max={evaluacionActual.maximum_score}
                        value={notas[s.id] ?? ""}
                        onChange={(e) => { setNotas((prev) => ({ ...prev, [s.id]: e.target.value })); setSaved(false); }}
                        className="w-24 rounded border border-slate-300 px-2.5 py-1.5 text-sm text-right"
                        placeholder="—"
                      />
                    </div>
                  ))}
                  {students.length === 0 && <p className="p-6 text-sm text-slate-400 text-center">No hay estudiantes activos en este curso y paralelo.</p>}
                </div>
                <div className="flex items-center justify-end gap-3">
                  {saved && <span className="text-xs text-emerald-700 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Notas guardadas</span>}
                  <button onClick={guardarNotas} disabled={guardando} className="inline-flex items-center gap-2 rounded bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                    {guardando ? "Guardando…" : "Guardar notas"}
                  </button>
                </div>
              </>
            ) : (
              <div className="bg-white border border-slate-200 rounded p-8 text-center text-sm text-slate-400">Crea una evaluación para empezar a registrar notas.</div>
            )}
          </div>
        </div>
      )}

      {showNueva && <NuevaEvaluacionModal tipos={tipos} onClose={() => setShowNueva(false)} onSave={crearEvaluacion} />}
    </div>
  );
}

function NuevaEvaluacionModal({ tipos, onClose, onSave }) {
  const [titulo, setTitulo] = useState("");
  const [evaluationTypeId, setEvaluationTypeId] = useState(tipos[0]?.id || "");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [puntajeMax, setPuntajeMax] = useState(100);
  const [ponderacion, setPonderacion] = useState(20);

  const guardar = () => {
    if (!titulo.trim()) return;
    onSave({ titulo: titulo.trim(), evaluationTypeId, fecha, puntajeMax: Number(puntajeMax), ponderacion: Number(ponderacion) });
  };

  return (
    <Modal title="Nueva evaluación" onClose={onClose} maxWidth="sm:max-w-md"
      footer={
        <>
          <button onClick={onClose} className="text-sm text-slate-600 px-4 py-2">Cancelar</button>
          <button onClick={guardar} className="text-sm bg-slate-900 text-white px-4 py-2 rounded hover:bg-slate-800">Crear evaluación</button>
        </>
      }
    >
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
      <div className="grid grid-cols-2 gap-4">
        <Field label="Puntaje máximo" type="number" value={puntajeMax} onChange={setPuntajeMax} />
        <Field label="Ponderación (%)" type="number" value={ponderacion} onChange={setPonderacion} />
      </div>
    </Modal>
  );
}
