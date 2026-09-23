import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Trash2, Pencil, Check, X, AlertTriangle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { Modal, StatusPill, ESTADOS_ASISTENCIA } from "../components/ui";

// Historial de asistencia de un curso/paralelo: lista todas las sesiones (días) ya
// registradas, con la posibilidad de corregir el estado de un alumno, cambiar la
// fecha de un día completo (por ejemplo si se marcó en la fecha equivocada) o
// eliminar un registro individual o el día completo.
//
// "Fecha" vive en class_sessions (una fecha por sesión, compartida por todo el curso
// ese día); "estado" y "eliminar" pueden ser por alumno (tabla attendance) o por
// sesión completa.

const fmtFecha = (d) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

export default function HistorialAsistenciaModal({ courseId, parallelId, subjectId, subjects, onClose, onChanged }) {
  const [filtroMateria, setFiltroMateria] = useState(subjectId || "");
  const [sesiones, setSesiones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [expandidas, setExpandidas] = useState(() => new Set());
  const [editandoFechaId, setEditandoFechaId] = useState(null);
  const [fechaEditada, setFechaEditada] = useState("");
  const [procesandoId, setProcesandoId] = useState(null); // sesión o registro en curso (deshabilita botones)
  const [huboCambios, setHuboCambios] = useState(false);

  async function cargar() {
    setCargando(true);
    setError("");
    let q = supabase
      .from("class_sessions")
      .select("id, class_date, subject_id, subjects(name)")
      .eq("course_id", courseId)
      .eq("parallel_id", parallelId)
      .order("class_date", { ascending: false });
    if (filtroMateria) q = q.eq("subject_id", filtroMateria);
    const { data: sesionesData, error: errSes } = await q;
    if (errSes) {
      setError("No se pudo cargar el historial: " + errSes.message);
      setCargando(false);
      return;
    }

    const ids = (sesionesData || []).map((s) => s.id);
    let marcas = [];
    if (ids.length > 0) {
      const { data } = await supabase.from("attendance").select("id, class_session_id, student_id, status").in("class_session_id", ids);
      marcas = data || [];
    }

    // Nombres de alumnos: se incluyen inactivos también, para no perder el nombre
    // en registros históricos de alumnos que ya se retiraron.
    const { data: alumnos } = await supabase.from("students").select("id, first_name, last_name").eq("course_id", courseId).eq("parallel_id", parallelId);
    const nombrePorAlumno = {};
    (alumnos || []).forEach((a) => { nombrePorAlumno[a.id] = `${a.first_name} ${a.last_name}`; });

    const porSesion = {};
    marcas.forEach((m) => { (porSesion[m.class_session_id] ||= []).push(m); });

    const armadas = (sesionesData || []).map((s) => ({
      id: s.id,
      fecha: s.class_date,
      subjectId: s.subject_id,
      materiaNombre: s.subjects?.name || "—",
      registros: (porSesion[s.id] || [])
        .map((m) => ({ ...m, nombre: nombrePorAlumno[m.student_id] || "Alumno eliminado" }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    }));
    setSesiones(armadas);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroMateria]);

  const alternarExpandida = (id) => {
    setExpandidas((prev) => {
      const copia = new Set(prev);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  };

  const cambiarEstado = async (sesion, registro, nuevoEstado) => {
    if (registro.status === nuevoEstado) return;
    setProcesandoId(registro.id);
    const { error: err } = await supabase.from("attendance").update({ status: nuevoEstado }).eq("id", registro.id);
    setProcesandoId(null);
    if (err) { alert("No se pudo cambiar el estado: " + err.message); return; }
    setSesiones((prev) =>
      prev.map((s) => (s.id !== sesion.id ? s : { ...s, registros: s.registros.map((r) => (r.id === registro.id ? { ...r, status: nuevoEstado } : r)) }))
    );
    setHuboCambios(true);
  };

  const eliminarRegistro = async (sesion, registro) => {
    if (!window.confirm(`¿Eliminar el registro de asistencia de ${registro.nombre} del ${fmtFecha(sesion.fecha)}?`)) return;
    setProcesandoId(registro.id);
    const { error: err } = await supabase.from("attendance").delete().eq("id", registro.id);
    setProcesandoId(null);
    if (err) { alert("No se pudo eliminar: " + err.message); return; }
    setSesiones((prev) => prev.map((s) => (s.id !== sesion.id ? s : { ...s, registros: s.registros.filter((r) => r.id !== registro.id) })));
    setHuboCambios(true);
  };

  const iniciarEdicionFecha = (sesion) => {
    setEditandoFechaId(sesion.id);
    setFechaEditada(sesion.fecha);
  };

  const guardarFecha = async (sesion) => {
    if (!fechaEditada || fechaEditada === sesion.fecha) { setEditandoFechaId(null); return; }
    setProcesandoId(sesion.id);
    const { error: err } = await supabase.from("class_sessions").update({ class_date: fechaEditada }).eq("id", sesion.id);
    setProcesandoId(null);
    if (err) {
      alert(err.code === "23505" ? "Ya existe una sesión de esa materia en esa fecha para este curso y paralelo." : "No se pudo cambiar la fecha: " + err.message);
      return;
    }
    setSesiones((prev) => prev.map((s) => (s.id === sesion.id ? { ...s, fecha: fechaEditada } : s)).sort((a, b) => b.fecha.localeCompare(a.fecha)));
    setEditandoFechaId(null);
    setHuboCambios(true);
  };

  const eliminarSesion = async (sesion) => {
    if (
      !window.confirm(
        `¿Eliminar toda la asistencia del ${fmtFecha(sesion.fecha)} (${sesion.materiaNombre})? Se borrarán los ${sesion.registros.length} registro(s) de ese día. Esta acción no se puede deshacer.`
      )
    )
      return;
    setProcesandoId(sesion.id);
    const { error: errAtt } = await supabase.from("attendance").delete().eq("class_session_id", sesion.id);
    if (errAtt) { setProcesandoId(null); alert("No se pudo eliminar: " + errAtt.message); return; }
    const { error: errSes } = await supabase.from("class_sessions").delete().eq("id", sesion.id);
    setProcesandoId(null);
    if (errSes) { alert("No se pudo eliminar la sesión: " + errSes.message); return; }
    setSesiones((prev) => prev.filter((s) => s.id !== sesion.id));
    setHuboCambios(true);
  };

  const cerrar = async () => {
    if (huboCambios) await onChanged?.();
    onClose();
  };

  return (
    <Modal
      title="Historial de asistencia"
      onClose={cerrar}
      maxWidth="sm:max-w-3xl"
      footer={<button onClick={cerrar} className="text-sm bg-slate-900 text-white px-4 py-2 rounded hover:bg-slate-800">Cerrar</button>}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">Materia</label>
          <select value={filtroMateria} onChange={(e) => setFiltroMateria(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {error && (
          <p className="flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
          </p>
        )}

        {cargando && <p className="text-sm text-slate-400 text-center py-6">Cargando…</p>}

        {!cargando && sesiones.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">No hay asistencia registrada para este curso y paralelo.</p>
        )}

        <div className="max-h-[60vh] overflow-y-auto border border-slate-200 rounded divide-y divide-slate-100">
          {sesiones.map((sesion) => {
            const abierta = expandidas.has(sesion.id);
            const procesando = procesandoId === sesion.id;
            return (
              <div key={sesion.id}>
                <div className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50">
                  <button onClick={() => alternarExpandida(sesion.id)} className="text-slate-400 hover:text-slate-700" aria-label="Expandir">
                    {abierta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>

                  {editandoFechaId === sesion.id ? (
                    <div className="flex items-center gap-1.5" onClick={(ev) => ev.stopPropagation()}>
                      <input
                        type="date"
                        value={fechaEditada}
                        onChange={(e) => setFechaEditada(e.target.value)}
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                        autoFocus
                      />
                      <button onClick={() => guardarFecha(sesion)} disabled={procesando} title="Guardar fecha" className="rounded bg-emerald-600 p-1 text-white hover:bg-emerald-700 disabled:opacity-50">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setEditandoFechaId(null)} disabled={procesando} title="Cancelar" className="rounded border border-slate-300 p-1 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => alternarExpandida(sesion.id)} className="flex-1 flex items-center gap-2 text-left text-sm">
                      <span className="font-medium text-slate-800">{fmtFecha(sesion.fecha)}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500">{sesion.materiaNombre}</span>
                      <span className="text-xs text-slate-400">({sesion.registros.length} alumno(s))</span>
                    </button>
                  )}

                  {editandoFechaId !== sesion.id && (
                    <>
                      <button onClick={() => iniciarEdicionFecha(sesion)} title="Cambiar fecha" className="text-slate-400 hover:text-emerald-700">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => eliminarSesion(sesion)} disabled={procesando} title="Eliminar todo el día" className="text-slate-400 hover:text-red-600 disabled:opacity-50">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>

                {abierta && (
                  <div className="divide-y divide-slate-50 bg-slate-50/50">
                    {sesion.registros.length === 0 && (
                      <p className="px-4 py-2 text-xs text-slate-400">Sin registros individuales (quedó el día pero sin alumnos marcados).</p>
                    )}
                    {sesion.registros.map((r) => (
                      <div key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-1.5">
                        <span className="flex-1 min-w-[10rem] text-sm text-slate-700">{r.nombre}</span>
                        <div className="flex flex-wrap gap-1.5">
                          {ESTADOS_ASISTENCIA.map((e) => (
                            <StatusPill key={e.key} estadoKey={e.key} selected={r.status === e.key} onClick={() => cambiarEstado(sesion, r, e.key)} />
                          ))}
                        </div>
                        <button onClick={() => eliminarRegistro(sesion, r)} disabled={procesandoId === r.id} title="Eliminar este registro" className="text-slate-300 hover:text-red-600 disabled:opacity-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
