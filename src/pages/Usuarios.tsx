import { useEffect, useState } from "react";
import { UserPlus, Pencil, KeyRound } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { supabaseSecondary } from "../lib/supabaseSecondary";

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [creando, setCreando] = useState(false);
  const [mensaje, setMensaje] = useState(null); // { tipo: 'ok' | 'error', texto }

  // --- Edición de un usuario existente ---
  const [editando, setEditando] = useState(null);
  const [editFullName, setEditFullName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [mensajeEdicion, setMensajeEdicion] = useState(null);

  // --- Resetear contraseña (nuevo) ---
  const [resetUser, setResetUser] = useState(null);
  const [nuevaClave, setNuevaClave] = useState("");
  const [reseteando, setReseteando] = useState(false);
  const [mensajeReset, setMensajeReset] = useState(null);

  async function cargar() {
    setCargando(true);
    const { data } = await supabase.from("profiles").select("*").order("full_name");
    setUsuarios(data || []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  const crearUsuario = async (e) => {
    e.preventDefault();
    setMensaje(null);
    if (password.length < 6) {
      setMensaje({ tipo: "error", texto: "La contraseña debe tener al menos 6 caracteres." });
      return;
    }
    setCreando(true);
    const { data, error } = await supabaseSecondary.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    setCreando(false);

    if (error) {
      setMensaje({ tipo: "error", texto: error.message });
      return;
    }

    // El teléfono y el correo se guardan con una actualización aparte porque
    // el trigger solo copia el nombre al crear el usuario.
    if (data.user) {
      await supabase.from("profiles").update({ phone: phone || null, email }).eq("id", data.user.id);
    }

    setMensaje({
      tipo: "ok",
      texto: "Profesor creado correctamente. Si tu proyecto pide confirmar el correo, debe hacerlo antes de poder entrar.",
    });
    setFullName(""); setEmail(""); setPassword(""); setPhone("");
    cargar();
  };

  const cambiarActivo = async (id, activo) => {
    await supabase.from("profiles").update({ active: !activo }).eq("id", id);
    cargar();
  };

  const cambiarRol = async (id, rolActual) => {
    const nuevo = rolActual === "admin" ? "teacher" : "admin";
    await supabase.from("profiles").update({ role: nuevo }).eq("id", id);
    cargar();
  };

  // ---------- Editar nombre / teléfono ----------

  const abrirEdicion = (u) => {
    setMensajeEdicion(null);
    setEditando(u);
    setEditFullName(u.full_name || "");
    setEditPhone(u.phone || "");
  };

  const cerrarEdicion = () => setEditando(null);

  const guardarEdicion = async (e) => {
    e.preventDefault();
    if (!editando) return;
    setGuardandoEdicion(true);
    setMensajeEdicion(null);

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: editFullName, phone: editPhone || null })
      .eq("id", editando.id);

    setGuardandoEdicion(false);

    if (error) {
      setMensajeEdicion({ tipo: "error", texto: error.message });
      return;
    }

    setEditando(null);
    cargar();
  };

  // ---------- Resetear contraseña ----------

  const abrirReset = (u) => {
    setMensajeReset(null);
    setNuevaClave("");
    setResetUser(u);
  };

  const cerrarReset = () => setResetUser(null);

  const guardarReset = async (e) => {
    e.preventDefault();
    if (!resetUser) return;
    setReseteando(true);
    setMensajeReset(null);

    const { data: sesion } = await supabase.auth.getSession();
    const token = sesion.session?.access_token;

    if (!token) {
      setMensajeReset({ tipo: "error", texto: "Tu sesión expiró, vuelve a iniciar sesión." });
      setReseteando(false);
      return;
    }

    const respuesta = await fetch("/.netlify/functions/resetear-clave", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ user_id: resetUser.id, new_password: nuevaClave }),
    });

    const resultado = await respuesta.json();
    setReseteando(false);

    if (!respuesta.ok) {
      setMensajeReset({ tipo: "error", texto: resultado.error ?? "No se pudo cambiar la contraseña." });
      return;
    }

    setResetUser(null);
  };

  return (
    <div className="p-4 md:p-8 grid lg:grid-cols-5 gap-6">
      <form onSubmit={crearUsuario} className="lg:col-span-2 bg-white border border-slate-200 rounded p-5 space-y-4 h-fit">
        <h3 className="font-ledger text-base font-semibold text-slate-900">Crear nuevo usuario</h3>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Nombre completo</label>
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Correo electrónico</label>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Contraseña temporal</label>
          <input required type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Teléfono (opcional)</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        {mensaje && (
          <p className={`text-sm ${mensaje.tipo === "ok" ? "text-emerald-700" : "text-red-700"}`}>{mensaje.texto}</p>
        )}
        <button type="submit" disabled={creando} className="w-full inline-flex items-center justify-center gap-2 rounded bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          <UserPlus className="h-4 w-4" /> {creando ? "Creando…" : "Crear usuario"}
        </button>
        <p className="text-xs text-slate-400">
          El nuevo usuario se crea con el rol "Profesor". Puedes convertirlo en administrador desde la lista de la derecha.
        </p>
      </form>

      <div className="lg:col-span-3 space-y-3">
        <p className="text-xs text-slate-500">Usuarios del sistema</p>
        <div className="bg-white border border-slate-200 rounded divide-y divide-slate-100">
          {usuarios.map((u) => (
            <div key={u.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div>
                <p className="text-sm text-slate-800">{u.full_name || "(sin nombre)"}</p>
                <p className="text-xs text-slate-500">{u.email || "sin correo"}{u.phone ? ` · ${u.phone}` : ""}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${u.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                  {u.active ? "Activo" : "Inactivo"}
                </span>
                <button onClick={() => cambiarRol(u.id, u.role)} className="text-xs px-2.5 py-1 rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50">
                  {u.role === "admin" ? "Administrador" : "Profesor"}
                </button>
                <button onClick={() => cambiarActivo(u.id, u.active)} className="text-xs text-slate-500 hover:underline">
                  {u.active ? "Desactivar" : "Activar"}
                </button>
                <button onClick={() => abrirEdicion(u)} className="text-xs text-slate-500 hover:underline inline-flex items-center gap-1">
                  <Pencil className="h-3 w-3" /> Editar
                </button>
                <button onClick={() => abrirReset(u)} className="text-xs text-slate-500 hover:underline inline-flex items-center gap-1">
                  <KeyRound className="h-3 w-3" /> Resetear clave
                </button>
              </div>
            </div>
          ))}
          {!cargando && usuarios.length === 0 && <p className="p-6 text-sm text-slate-400 text-center">Sin usuarios todavía.</p>}
        </div>
      </div>

      {/* Modal: editar nombre/teléfono */}
      {editando && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form onSubmit={guardarEdicion} className="bg-white rounded p-5 space-y-4 w-full max-w-sm">
            <h3 className="font-ledger text-base font-semibold text-slate-900">Editar usuario</h3>
            <p className="text-xs text-slate-400">{editando.email}</p>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Nombre completo</label>
              <input required value={editFullName} onChange={(e) => setEditFullName(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Teléfono</label>
              <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
            </div>

            {mensajeEdicion && (
              <p className={`text-sm ${mensajeEdicion.tipo === "ok" ? "text-emerald-700" : "text-red-700"}`}>{mensajeEdicion.texto}</p>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={cerrarEdicion} className="text-sm text-slate-500 px-3 py-2">
                Cancelar
              </button>
              <button type="submit" disabled={guardandoEdicion} className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {guardandoEdicion ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: resetear contraseña */}
      {resetUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form onSubmit={guardarReset} className="bg-white rounded p-5 space-y-4 w-full max-w-sm">
            <h3 className="font-ledger text-base font-semibold text-slate-900">Restablecer contraseña</h3>
            <p className="text-xs text-slate-400">{resetUser.full_name || resetUser.email}</p>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Nueva contraseña</label>
              <input
                required
                type="text"
                minLength={6}
                value={nuevaClave}
                onChange={(e) => setNuevaClave(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            {mensajeReset && (
              <p className={`text-sm ${mensajeReset.tipo === "ok" ? "text-emerald-700" : "text-red-700"}`}>{mensajeReset.texto}</p>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={cerrarReset} className="text-sm text-slate-500 px-3 py-2">
                Cancelar
              </button>
              <button type="submit" disabled={reseteando} className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {reseteando ? "Cambiando…" : "Cambiar contraseña"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
