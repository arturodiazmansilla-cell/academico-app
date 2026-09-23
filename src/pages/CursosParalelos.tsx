import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Pencil, Check, X, Search } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const NIVELES = ["Inicial", "Primario", "Secundario"];

const NIVEL_ESTILO = {
  Inicial: "bg-amber-50 text-amber-700 border-amber-200",
  Primario: "bg-blue-50 text-blue-700 border-blue-200",
  Secundario: "bg-violet-50 text-violet-700 border-violet-200",
};

export default function CursosParalelos() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nuevoCurso, setNuevoCurso] = useState("");
  const [nuevoNivel, setNuevoNivel] = useState("");
  const [errorNuevo, setErrorNuevo] = useState("");
  const [nuevoParalelo, setNuevoParalelo] = useState({});
  const [editandoId, setEditandoId] = useState(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState("");
  const [guardandoNivelId, setGuardandoNivelId] = useState(null);
  const [errorNivelId, setErrorNivelId] = useState(null);

  // --- Filtros de la lista (nuevo) ---
  const [busqueda, setBusqueda] = useState("");
  const [filtroNivel, setFiltroNivel] = useState("");

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

  const cursosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return courses.filter((c) => {
      const coincideNombre = !texto || c.name.toLowerCase().includes(texto);
      const coincideNivel = !filtroNivel || c.level === filtroNivel;
      return coincideNombre && coincideNivel;
    });
  }, [courses, busqueda, filtroNivel]);

  const crearCurso = async () => {
    setErrorNuevo("");
    const nombre = nuevoCurso.trim();
    if (!nombre) return;
    if (!nuevoNivel) {
      setErrorNuevo("Selecciona el nivel del curso.");
      return;
    }
    // Verifica duplicados antes de guardar (sin distinguir mayúsculas/espacios).
    const yaExiste = courses.some((c) => c.name.trim().toLowerCase() === nombre.toLowerCase());
    if (yaExiste) {
      setErrorNuevo("Ya existe un curso con ese nombre.");
      return;
    }
    const { error } = await supabase.from("courses").insert({ name: nombre, level: nuevoNivel });
    if (!error) {
      setNuevoCurso("");
      setNuevoNivel("");
      cargar();
    } else {
      setErrorNuevo(
        error.code === "23505" ? "Ya existe un curso con ese nombre." : "No se pudo crear: " + error.message
      );
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

  const cambiarNivel = async (id, level) => {
    setGuardandoNivelId(id);
    setErrorNivelId(null);
    setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, level } : c)));
    const { error } = await supabase.from("courses").update({ level }).eq("id", id);
    setGuardandoNivelId(null);
    if (error) {
      setErrorNivelId(id);
      cargar();
    }
  };

  const iniciarEdicion = (curso) => {
    setEditandoId(curso.id);
    setNombreEditado(curso.name);
    setErrorEdicion("");
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setNombreEditado("");
    setErrorEdicion("");
  };

  const guardarEdicion = async (id) => {
    const nombre = nombreEditado.trim();
    if (!nombre) {
      setErrorEdicion("El nombre no puede quedar vacío.");
      return;
    }
    setGuardandoEdicion(true);
    const { error } = await supabase.from("courses").update({ name: nombre }).eq("id", id);
    setGuardandoEdicion(false);
    if (error) {
      setErrorEdicion(
        error.code === "23505" ? "Ya existe un curso con ese nombre." : "No se pudo guardar: " + error.message
      );
      return;
    }
    setEditandoId(null);
    setNombreEditado("");
    cargar();
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl space-y-6">
      <div className="bg-white border border-slate-200 rounded p-5 space-y-4">
        <h3 className="font-ledger text-base font-semibold text-slate-900">Nuevo curso</h3>
        <div className="flex flex-col sm:flex-row sm:items-end gap-2">
          <div className="flex-1">
            <input
              value={nuevoCurso}
              onChange={(e) => setNuevoCurso(e.target.value)}
              placeholder="Ej. 1RO SECUNDARIA"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:w-44">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Nivel</label>
            <select
              value={nuevoNivel}
              onChange={(e) => setNuevoNivel(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
            >
              <option value="">Nivel…</option>
              {NIVELES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button onClick={crearCurso} className="inline-flex items-center justify-center gap-2 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            <Plus className="h-4 w-4" /> Crear
          </button>
        </div>
        {errorNuevo && <p className="text-xs text-red-600">{errorNuevo}</p>}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar curso por nombre"
            className="w-full rounded border border-slate-300 pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <select
          value={filtroNivel}
          onChange={(e) => setFiltroNivel(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 sm:w-48"
        >
          <option value="">Todos los niveles</option>
          {NIVELES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : (
        <div className="space-y-4">
          {cursosFiltrados.map((c) => (
            <div key={c.id} className="bg-white border border-slate-200 rounded p-5">
              <div className="flex items-center justify-between mb-3 gap-3">
                {editandoId === c.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      autoFocus
                      value={nombreEditado}
                      onChange={(e) => setNombreEditado(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") guardarEdicion(c.id);
                        if (e.key === "Escape") cancelarEdicion();
                      }}
                      className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm font-ledger font-semibold"
                    />
                    <button
                      onClick={() => guardarEdicion(c.id)}
                      disabled={guardandoEdicion}
                      className="text-emerald-700 hover:text-emerald-800 disabled:opacity-40"
                      title="Guardar"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button onClick={cancelarEdicion} className="text-slate-400 hover:text-red-600" title="Cancelar">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center gap-2 group flex-wrap">
                    <p className="font-ledger text-sm font-semibold text-slate-900">{c.name}</p>
                    <button
                      onClick={() => iniciarEdicion(c)}
                      className="text-slate-300 hover:text-slate-700"
                      title="Editar nombre"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <button onClick={() => eliminarCurso(c.id)} className="text-slate-400 hover:text-red-600 shrink-0">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {editandoId === c.id && errorEdicion && (
                <p className="text-xs text-red-600 mb-3">{errorEdicion}</p>
              )}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-slate-500">Nivel:</span>
                <select
                  value={c.level || ""}
                  onChange={(e) => cambiarNivel(c.id, e.target.value)}
                  disabled={guardandoNivelId === c.id}
                  className={`rounded border px-2 py-1 text-xs disabled:opacity-50 ${
                    c.level
                      ? NIVEL_ESTILO[c.level] || "border-slate-300 text-slate-700"
                      : "border-amber-300 bg-amber-50 text-amber-700"
                  }`}
                >
                  <option value="">Sin nivel</option>
                  {NIVELES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                {guardandoNivelId === c.id && <span className="text-xs text-slate-400">Guardando…</span>}
                {errorNivelId === c.id && <span className="text-xs text-red-600">No se pudo guardar el nivel.</span>}
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
          {cursosFiltrados.length === 0 && courses.length > 0 && (
            <p className="text-sm text-slate-400">Ningún curso coincide con el filtro.</p>
          )}
          {courses.length === 0 && <p className="text-sm text-slate-400">Todavía no hay cursos creados.</p>}
        </div>
      )}
    </div>
  );
}
