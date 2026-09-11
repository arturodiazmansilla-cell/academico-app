import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function CursosParalelos() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nuevoCurso, setNuevoCurso] = useState("");
  const [nuevoParalelo, setNuevoParalelo] = useState({});

  async function cargar() {
    setLoading(true);
    const { data } = await supabase
      .from("courses")
      .select("*, parallels(*)")
      .order("name");
    setCourses(data || []);
    setLoading(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  const crearCurso = async () => {
    if (!nuevoCurso.trim()) return;
    const { error } = await supabase.from("courses").insert({ name: nuevoCurso.trim() });
    if (!error) {
      setNuevoCurso("");
      cargar();
    }
  };

  const crearParalelo = async (courseId) => {
    const nombre = (nuevoParalelo[courseId] || "").trim();
    if (!nombre) return;
    const { error } = await supabase.from("parallels").insert({ course_id: courseId, name: nombre });
    if (!error) {
      setNuevoParalelo((prev) => ({ ...prev, [courseId]: "" }));
      cargar();
    }
  };

  const eliminarParalelo = async (id) => {
    await supabase.from("parallels").delete().eq("id", id);
    cargar();
  };

  const eliminarCurso = async (id) => {
    await supabase.from("courses").delete().eq("id", id);
    cargar();
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl space-y-6">
      <div className="bg-white border border-slate-200 rounded p-5 space-y-4">
        <h3 className="font-ledger text-base font-semibold text-slate-900">Nuevo curso</h3>
        <div className="flex gap-2">
          <input
            value={nuevoCurso}
            onChange={(e) => setNuevoCurso(e.target.value)}
            placeholder="Ej. 1RO SECUNDARIA"
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button onClick={crearCurso} className="inline-flex items-center gap-2 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            <Plus className="h-4 w-4" /> Crear
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : (
        <div className="space-y-4">
          {courses.map((c) => (
            <div key={c.id} className="bg-white border border-slate-200 rounded p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="font-ledger text-sm font-semibold text-slate-900">{c.name}</p>
                <button onClick={() => eliminarCurso(c.id)} className="text-slate-400 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {(c.parallels || []).map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-2 text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    Paralelo {p.name}
                    <button onClick={() => eliminarParalelo(p.id)} className="text-slate-400 hover:text-red-600">✕</button>
                  </span>
                ))}
                {(c.parallels || []).length === 0 && <span className="text-xs text-slate-400">Sin paralelos todavía.</span>}
              </div>
              <div className="flex gap-2">
                <input
                  value={nuevoParalelo[c.id] || ""}
                  onChange={(e) => setNuevoParalelo((prev) => ({ ...prev, [c.id]: e.target.value }))}
                  placeholder="Ej. A"
                  className="w-32 rounded border border-slate-300 px-3 py-1.5 text-sm"
                />
                <button onClick={() => crearParalelo(c.id)} className="text-xs text-emerald-700 hover:underline">
                  Agregar paralelo
                </button>
              </div>
            </div>
          ))}
          {courses.length === 0 && <p className="text-sm text-slate-400">Todavía no hay cursos creados.</p>}
        </div>
      )}
    </div>
  );
}
