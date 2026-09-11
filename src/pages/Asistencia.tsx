import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { StatusPill, ESTADOS_ASISTENCIA } from "../components/ui";

export default function Asistencia() {
  const { user } = useAuth();
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
  const [saved, setSaved] = useState(false);
  const [guardando, setGuardando] = useState(false);

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
    }
    cargarBase();
  }, []);

  const paralelosDelCurso = useMemo(() => parallels.filter((p) => p.course_id === courseId), [parallels, courseId]);

  useEffect(() => {
    async function cargarEstudiantesYSesion() {
      setEstados({});
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
      }
    }
    cargarEstudiantesYSesion();
  }, [subjectId, courseId, parallelId, fecha]);

  const marcar = (studentId, key) => {
    setEstados((prev) => ({ ...prev, [studentId]: key }));
    setSaved(false);
  };

  const marcarTodosPresentes = () => {
    const next = {};
    students.forEach((s) => (next[s.id] = "present"));
    setEstados(next);
    setSaved(false);
  };

  const guardar = async () => {
    if (!subjectId || !courseId || !parallelId) return;
    setGuardando(true);

    let sesionId = classSessionId;
    if (!sesionId) {
      const { data: nuevaSesion, error: errSesion } = await supabase
        .from("class_sessions")
        .insert({ subject_id: subjectId, teacher_id: user.id, course_id: courseId, parallel_id: parallelId, class_date: fecha })
        .select()
        .single();
      if (errSesion) { setGuardando(false); return; }
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
      await supabase.from("attendance").upsert(registros, { onConflict: "class_session_id,student_id" });
    }
    setGuardando(false);
    setSaved(true);
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

      {courseId && parallelId && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{students.length} estudiantes</p>
            <button onClick={marcarTodosPresentes} className="text-xs text-emerald-700 hover:underline">Marcar todos presentes</button>
          </div>

          <div className="bg-white border border-slate-200 rounded divide-y divide-slate-100">
            {students.map((s) => (
              <div key={s.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                <div>
                  <p className="text-sm text-slate-800">{s.first_name} {s.last_name}</p>
                  <p className="text-xs text-slate-500">{s.student_code || "s/código"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ESTADOS_ASISTENCIA.map((e) => (
                    <StatusPill key={e.key} estadoKey={e.key} selected={estados[s.id] === e.key} onClick={() => marcar(s.id, e.key)} />
                  ))}
                </div>
              </div>
            ))}
            {students.length === 0 && <p className="p-6 text-sm text-slate-400 text-center">No hay estudiantes activos en este curso y paralelo.</p>}
          </div>

          <div className="flex items-center justify-end gap-3">
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
    </div>
  );
}
