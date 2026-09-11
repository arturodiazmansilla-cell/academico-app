import { useEffect, useMemo, useState } from "react";
import { FileWarning, FileDown, FileSpreadsheet } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { exportarKardexPDF, exportarKardexExcel } from "../lib/kardexExport";

const TIPOS_KARDEX = [
  "Impuntualidad", "Incumplimiento de tareas", "Indisciplina en aula", "Falta de respeto",
  "Uso indebido de celular", "Agresión verbal", "Agresión física", "Falta grave al reglamento", "Otro",
];

function severidad(tipo) {
  if (/agresión física|falta grave/i.test(tipo)) return "bg-red-50 text-red-800 border-red-300";
  if (/agresión verbal|falta de respeto/i.test(tipo)) return "bg-orange-50 text-orange-800 border-orange-300";
  if (/impuntualidad|incumplimiento/i.test(tipo)) return "bg-amber-50 text-amber-800 border-amber-300";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

export default function Kardex() {
  const { user, profile, isAdmin } = useAuth();
  const { institutionName, logoUrl } = useSettings();

  const [alumnos, setAlumnos] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [cursoFiltro, setCursoFiltro] = useState("");
  const [courses, setCourses] = useState([]);

  const [alumnoId, setAlumnoId] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [tipo, setTipo] = useState(TIPOS_KARDEX[0]);
  const [descripcion, setDescripcion] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [alumnoExportId, setAlumnoExportId] = useState("");

  async function cargar() {
    const [{ data: est }, { data: cur }, { data: kar }] = await Promise.all([
      supabase.from("students").select("*, courses(name), parallels(name)").eq("active", true).order("last_name"),
      supabase.from("courses").select("*").order("name"),
      isAdmin
        ? supabase.from("kardex").select("*").order("incident_date", { ascending: false })
        : supabase.from("kardex").select("*").eq("teacher_id", user.id).order("incident_date", { ascending: false }),
    ]);
    setAlumnos(est || []);
    setCourses(cur || []);
    setRegistros(kar || []);
    if (est && est.length > 0) {
      setAlumnoId(est[0].id);
      setAlumnoExportId(est[0].id);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const registrar = async () => {
    if (!alumnoId) return;
    setGuardando(true);
    const { error } = await supabase.from("kardex").insert({
      student_id: alumnoId, teacher_id: user.id, incident_date: fecha, type: tipo, description: descripcion || null,
    });
    setGuardando(false);
    if (!error) {
      setDescripcion("");
      cargar();
    }
  };

  const historial = useMemo(() => {
    return registros
      .map((k) => ({ ...k, alumno: alumnos.find((a) => a.id === k.student_id) }))
      .filter((k) => !cursoFiltro || k.alumno?.course_id === cursoFiltro);
  }, [registros, alumnos, cursoFiltro]);

  const alumnoExport = alumnos.find((a) => a.id === alumnoExportId);
  const registrosExport = registros.filter((k) => k.student_id === alumnoExportId);

  return (
    <div className="p-4 md:p-8 grid lg:grid-cols-5 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-white border border-slate-200 rounded p-5 space-y-4">
          <h3 className="font-ledger text-base font-semibold text-slate-900">Nuevo registro de kardex</h3>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Estudiante</label>
            <select value={alumnoId} onChange={(e) => setAlumnoId(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
              {alumnos.map((a) => <option key={a.id} value={a.id}>{a.first_name} {a.last_name} — {a.courses?.name} {a.parallels?.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Tipo de falta / indisciplina</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
              {TIPOS_KARDEX.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Descripción</label>
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} placeholder="Detalle de lo ocurrido…" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <button onClick={registrar} disabled={guardando || !alumnoId} className="w-full inline-flex items-center justify-center gap-2 rounded bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            <FileWarning className="h-4 w-4" /> {guardando ? "Guardando…" : "Registrar en kardex"}
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded p-5 space-y-4">
          <div>
            <h3 className="font-ledger text-base font-semibold text-slate-900">Exportar kardex por alumno</h3>
            <p className="text-xs text-slate-500 mt-1">Genera el historial completo de un estudiante en PDF o Excel.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Estudiante</label>
            <select value={alumnoExportId} onChange={(e) => setAlumnoExportId(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
              {alumnos.map((a) => <option key={a.id} value={a.id}>{a.first_name} {a.last_name} — {a.courses?.name} {a.parallels?.name}</option>)}
            </select>
          </div>
          <p className="text-xs text-slate-500">{registrosExport.length} registro(s) encontrado(s) para este estudiante.</p>
          <div className="flex gap-2">
            <button
              onClick={() => alumnoExport && exportarKardexPDF(alumnoExport, registrosExport, institutionName, logoUrl, profile?.full_name)}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <FileDown className="h-4 w-4" /> PDF
            </button>
            <button
              onClick={() => alumnoExport && exportarKardexExcel(alumnoExport, registrosExport, institutionName)}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </button>
          </div>
        </div>
      </div>

      <div className="lg:col-span-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">Historial de kardex</p>
          <select value={cursoFiltro} onChange={(e) => setCursoFiltro(e.target.value)} className="rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600">
            <option value="">Todos los cursos</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="bg-white border border-slate-200 rounded divide-y divide-slate-100">
          {historial.map((k) => (
            <div key={k.id} className="p-4 flex flex-col sm:flex-row sm:items-start gap-2 sm:justify-between">
              <div>
                <p className="text-sm text-slate-800">{k.alumno ? `${k.alumno.first_name} ${k.alumno.last_name}` : "Alumno"}</p>
                <p className="text-xs text-slate-500">{k.alumno?.courses?.name} {k.alumno?.parallels?.name} · {k.incident_date}</p>
                {k.description && <p className="text-xs text-slate-500 mt-1 max-w-md">{k.description}</p>}
              </div>
              <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full border whitespace-nowrap ${severidad(k.type)}`}>{k.type}</span>
            </div>
          ))}
          {historial.length === 0 && <p className="p-6 text-sm text-slate-400 text-center">Sin registros de kardex todavía.</p>}
        </div>
      </div>
    </div>
  );
}
