import { useEffect, useMemo, useState } from "react";
import { FileWarning, FileDown, FileSpreadsheet, Pencil, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { exportarKardexPDF, exportarKardexExcel } from "../lib/kardexExport";
import { Modal } from "../components/ui";

// Mientras se cargan los tipos guardados en la base de datos, se muestran estos por
// defecto (son los mismos 9 que ya sembró la migración kardex_types.sql).
const TIPOS_KARDEX_POR_DEFECTO = [
  "Impuntualidad", "Incumplimiento de tareas", "Indisciplina en aula", "Falta de respeto",
  "Uso indebido de celular", "Agresión verbal", "Agresión física", "Falta grave al reglamento", "Otro",
];

const OPCION_NUEVO_TIPO = "__nuevo__";

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

  // Filas reales de kardex_types ({id, name}); si todavía no cargó, se usan los 9 de
  // siempre para que el formulario no se vea vacío.
  const [tiposFilas, setTiposFilas] = useState([]);
  const [showGestionTipos, setShowGestionTipos] = useState(false);

  const [alumnoId, setAlumnoId] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [tipo, setTipo] = useState(TIPOS_KARDEX_POR_DEFECTO[0]);
  const nombresTipos = tiposFilas.length > 0 ? tiposFilas.map((t) => t.name) : TIPOS_KARDEX_POR_DEFECTO;
  const [descripcion, setDescripcion] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [alumnoExportId, setAlumnoExportId] = useState("");

  async function cargarTipos() {
    const { data } = await supabase.from("kardex_types").select("*").eq("active", true).order("created_at");
    const filas = data || [];
    setTiposFilas(filas);
    if (filas.length > 0) {
      const nombres = filas.map((t) => t.name);
      setTipo((actual) => (nombres.includes(actual) ? actual : nombres[0]));
    }
    return filas;
  }

  async function cargar() {
    const [{ data: est }, { data: cur }, { data: kar }] = await Promise.all([
      supabase.from("students").select("*, courses(name), parallels(name)").eq("active", true).order("last_name"),
      supabase.from("courses").select("*").order("name"),
      isAdmin
        ? supabase.from("kardex").select("*").order("incident_date", { ascending: false })
        : supabase.from("kardex").select("*").eq("teacher_id", user.id).order("incident_date", { ascending: false }),
      cargarTipos(),
    ]);
    setAlumnos(est || []);
    setCourses(cur || []);
    setRegistros(kar || []);
    if (est && est.length > 0) {
      setAlumnoId(est[0].id);
      setAlumnoExportId(est[0].id);
    }
  }

  // "Otro" siempre queda al final de la lista; la opción de crear uno nuevo va después.
  const tiposOrdenados = useMemo(() => {
    const sinOtro = nombresTipos.filter((t) => t !== "Otro");
    return nombresTipos.includes("Otro") ? [...sinOtro, "Otro"] : sinOtro;
  }, [nombresTipos]);

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
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-600">Tipo de falta / indisciplina</label>
              <button type="button" onClick={() => setShowGestionTipos(true)} className="text-xs text-emerald-700 hover:underline">
                Gestionar
              </button>
            </div>
            <select
              value={tipo}
              onChange={(e) => {
                if (e.target.value === OPCION_NUEVO_TIPO) setShowGestionTipos(true);
                else setTipo(e.target.value);
              }}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              {tiposOrdenados.map((t) => <option key={t}>{t}</option>)}
              <option value={OPCION_NUEVO_TIPO}>+ Crear nueva falta/indisciplina…</option>
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

        {showGestionTipos && (
          <GestionTiposModal
            tiposFilas={tiposFilas}
            registros={registros}
            userId={user.id}
            onClose={() => setShowGestionTipos(false)}
            onChanged={cargarTipos}
          />
        )}

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

// Lista de tipos de falta/indisciplina con edición y eliminación. "Eliminar" oculta el
// tipo de la lista (active = false); no borra nada ni toca los registros de kardex que
// ya lo usaron, porque esos guardan el nombre como texto, no una referencia al tipo.
function GestionTiposModal({ tiposFilas, registros, userId, onClose, onChanged }) {
  const [editId, setEditId] = useState(null);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState(null);

  const limpiar = () => { setEditId(null); setNombre(""); setError(""); };
  const editar = (t) => { setEditId(t.id); setNombre(t.name); setError(""); };
  const contarUsos = (nombreTipo) => registros.filter((k) => k.type === nombreTipo).length;

  const guardar = async () => {
    const limpio = nombre.trim();
    if (!limpio) { setError("Escribe el nombre de la falta o indisciplina."); return; }
    const repetido = tiposFilas.some((t) => t.id !== editId && t.name.toLowerCase() === limpio.toLowerCase());
    if (repetido) { setError("Ya existe una falta con ese nombre."); return; }

    setGuardando(true);
    setError("");
    const { error: e } = editId
      ? await supabase.from("kardex_types").update({ name: limpio }).eq("id", editId)
      : await supabase.from("kardex_types").insert({ name: limpio, created_by: userId });
    setGuardando(false);
    if (e) {
      setError(e.code === "23505" ? "Ya existe una falta con ese nombre." : "No se pudo guardar: " + e.message);
      return;
    }
    limpiar();
    await onChanged();
  };

  const eliminar = async (t) => {
    const usos = contarUsos(t.name);
    const aviso =
      usos > 0
        ? `"${t.name}" ya se usó en ${usos} registro(s) de kardex. Esos registros no cambian, pero esta opción dejará de aparecer para registros nuevos. ¿Eliminar de todas formas?`
        : `¿Eliminar "${t.name}"?`;
    if (!window.confirm(aviso)) return;

    setEliminandoId(t.id);
    const { error: e } = await supabase.from("kardex_types").update({ active: false }).eq("id", t.id);
    setEliminandoId(null);
    if (e) { setError("No se pudo eliminar: " + e.message); return; }
    if (editId === t.id) limpiar();
    await onChanged();
  };

  return (
    <Modal
      title="Tipos de falta / indisciplina"
      onClose={onClose}
      maxWidth="sm:max-w-lg"
      footer={<button onClick={onClose} className="text-sm text-slate-600 px-4 py-2">Cerrar</button>}
    >
      <div className="max-h-64 overflow-y-auto border border-slate-200 rounded divide-y divide-slate-100">
        {tiposFilas.length === 0 && <p className="p-4 text-sm text-slate-400 text-center">No hay tipos registrados.</p>}
        {tiposFilas.map((t) => (
          <div key={t.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
            <span className="flex-1 text-slate-800">{t.name}</span>
            <button onClick={() => editar(t)} className="text-slate-400 hover:text-slate-700" title="Editar" aria-label={`Editar ${t.name}`}>
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => eliminar(t)}
              disabled={eliminandoId === t.id}
              className="text-slate-400 hover:text-red-600 disabled:opacity-50"
              title="Eliminar"
              aria-label={`Eliminar ${t.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="border border-slate-200 rounded p-4 space-y-3">
        <p className="text-sm font-medium text-slate-700">{editId ? "Editar falta / indisciplina" : "Nueva falta / indisciplina"}</p>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); guardar(); } }}
          placeholder="Ej. Copia en examen"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-3">
          <button onClick={guardar} disabled={guardando} className="text-sm bg-slate-900 text-white px-4 py-2 rounded hover:bg-slate-800 disabled:opacity-50">
            {guardando ? "Guardando…" : editId ? "Guardar cambios" : "Crear"}
          </button>
          {editId && <button onClick={limpiar} className="text-sm text-slate-500 hover:underline">Cancelar edición</button>}
        </div>
      </div>

      {editId && (
        <p className="text-xs text-slate-500">
          Cambiar el nombre no modifica los registros de kardex ya guardados con el nombre anterior; solo afecta a los nuevos.
        </p>
      )}
    </Modal>
  );
}
