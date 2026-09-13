import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Materia, Profile } from '../../types/academico';

export default function Profesores() {
  const [profesores, setProfesores] = useState<Profile[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // --- Formulario de alta (ya existía) ---
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [materiasSeleccionadas, setMateriasSeleccionadas] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  // --- Edición de un profesor existente (nuevo) ---
  const [editando, setEditando] = useState<Profile | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'teacher'>('teacher');
  const [editActive, setEditActive] = useState(true);
  const [editMaterias, setEditMaterias] = useState<string[]>([]);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    const [profesoresRes, materiasRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, phone, role, active, created_at').order('full_name'),
      supabase.from('materias').select('*').eq('activa', true).order('nombre'),
    ]);
    if (profesoresRes.error) setMensaje({ tipo: 'error', texto: profesoresRes.error.message });
    else setProfesores(profesoresRes.data ?? []);

    if (materiasRes.data) setMaterias(materiasRes.data);
    setCargando(false);
  }

  function toggleMateria(id: string) {
    setMateriasSeleccionadas((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  async function crearProfesor(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setMensaje(null);

    const { data: sesion } = await supabase.auth.getSession();
    const token = sesion.session?.access_token;

    if (!token) {
      setMensaje({ tipo: 'error', texto: 'Tu sesión expiró, vuelve a iniciar sesión.' });
      setGuardando(false);
      return;
    }

    const respuesta = await fetch('/.netlify/functions/crear-profesor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ full_name: fullName, email, phone, password, materias_ids: materiasSeleccionadas }),
    });

    const resultado = await respuesta.json();
    setGuardando(false);

    if (!respuesta.ok) {
      setMensaje({ tipo: 'error', texto: resultado.error ?? 'No se pudo crear el profesor.' });
      return;
    }

    setMensaje({ tipo: 'ok', texto: resultado.aviso ?? 'Profesor creado correctamente.' });
    setFullName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setMateriasSeleccionadas([]);
    cargar();
  }

  // ---------- EDICIÓN ----------

  async function abrirEdicion(p: Profile) {
    setMensaje(null);
    setEditando(p);
    setEditFullName(p.full_name ?? '');
    setEditPhone(p.phone ?? '');
    setEditRole(p.role);
    setEditActive(p.active);

    const { data, error } = await supabase.from('profesor_materias').select('materia_id').eq('profesor_id', p.id);
    if (!error) setEditMaterias((data ?? []).map((fila) => fila.materia_id));
  }

  function cerrarEdicion() {
    setEditando(null);
  }

  function toggleEditMateria(id: string) {
    setEditMaterias((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  async function guardarEdicion(e: React.FormEvent) {
    e.preventDefault();
    if (!editando) return;
    setGuardandoEdicion(true);
    setMensaje(null);

    // 1. Actualiza los datos del perfil.
    const { error: errorPerfil } = await supabase
      .from('profiles')
      .update({
        full_name: editFullName,
        phone: editPhone || null,
        role: editRole,
        active: editActive,
      })
      .eq('id', editando.id);

    if (errorPerfil) {
      setMensaje({ tipo: 'error', texto: 'Error al guardar: ' + errorPerfil.message });
      setGuardandoEdicion(false);
      return;
    }

    // 2. Reemplaza sus materias asignadas: borra las anteriores y crea las nuevas.
    const { error: errorBorrar } = await supabase.from('profesor_materias').delete().eq('profesor_id', editando.id);
    if (errorBorrar) {
      setMensaje({ tipo: 'error', texto: 'Perfil guardado, pero falló actualizar materias: ' + errorBorrar.message });
      setGuardandoEdicion(false);
      cargar();
      return;
    }

    if (editMaterias.length > 0) {
      const filas = editMaterias.map((materia_id) => ({ profesor_id: editando.id, materia_id }));
      const { error: errorInsertar } = await supabase.from('profesor_materias').insert(filas);
      if (errorInsertar) {
        setMensaje({ tipo: 'error', texto: 'Perfil guardado, pero falló asignar materias: ' + errorInsertar.message });
        setGuardandoEdicion(false);
        cargar();
        return;
      }
    }

    setMensaje({ tipo: 'ok', texto: 'Profesor actualizado correctamente.' });
    setGuardandoEdicion(false);
    setEditando(null);
    cargar();
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Profesores</h1>

      {mensaje && (
        <div
          className={`mb-4 rounded-md px-4 py-3 text-sm ${
            mensaje.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      {/* Formulario de alta */}
      <form onSubmit={crearProfesor} className="space-y-4 border rounded-md p-4 mb-8">
        <h2 className="font-medium">Registrar nuevo profesor</h2>
        <input
          className="w-full rounded-md border border-gray-300 px-3 py-2"
          placeholder="Nombre completo"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        <input
          type="email"
          className="w-full rounded-md border border-gray-300 px-3 py-2"
          placeholder="Correo electrónico"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full rounded-md border border-gray-300 px-3 py-2"
          placeholder="Teléfono (opcional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <input
          type="password"
          className="w-full rounded-md border border-gray-300 px-3 py-2"
          placeholder="Contraseña temporal (mín. 8 caracteres)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        {materias.length > 0 && (
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-2">Materias que dicta (opcional)</span>
            <div className="flex flex-wrap gap-2">
              {materias.map((m) => (
                <label
                  key={m.id}
                  className={`text-sm px-3 py-1 rounded-full border cursor-pointer ${
                    materiasSeleccionadas.includes(m.id)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  <input type="checkbox" className="hidden" onChange={() => toggleMateria(m.id)} />
                  {m.nombre}
                </label>
              ))}
            </div>
          </div>
        )}
        <button
          type="submit"
          disabled={guardando}
          className="rounded-md bg-blue-600 px-5 py-2 text-white font-medium disabled:opacity-50"
        >
          {guardando ? 'Creando…' : 'Crear profesor'}
        </button>
      </form>

      {/* Lista con botón Editar */}
      <h2 className="font-medium mb-3">Usuarios registrados</h2>
      {cargando ? (
        <p className="text-gray-500">Cargando…</p>
      ) : profesores.length === 0 ? (
        <p className="text-gray-500">Todavía no registraste ningún profesor.</p>
      ) : (
        <ul className="divide-y divide-gray-200 border rounded-md">
          {profesores.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium">
                  {p.full_name || '(sin nombre)'}{' '}
                  <span className="text-xs text-gray-400">({p.role === 'admin' ? 'Admin' : 'Profesor'})</span>
                </p>
                <p className="text-sm text-gray-500">{p.email}</p>
                {!p.active && <span className="text-xs text-red-500">Inactivo</span>}
              </div>
              <button onClick={() => abrirEdicion(p)} className="text-blue-600 text-sm hover:underline">
                Editar
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Modal de edición */}
      {editando && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Editar: {editando.email}</h2>

            <form onSubmit={guardarEdicion} className="space-y-4">
              <input
                className="w-full rounded-md border border-gray-300 px-3 py-2"
                placeholder="Nombre completo"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                required
              />
              <input
                className="w-full rounded-md border border-gray-300 px-3 py-2"
                placeholder="Teléfono"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />

              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">Rol</span>
                <select
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as 'admin' | 'teacher')}
                >
                  <option value="teacher">Profesor</option>
                  <option value="admin">Administrador</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
                Cuenta activa
              </label>

              {materias.length > 0 && (
                <div>
                  <span className="block text-sm font-medium text-gray-700 mb-2">Materias que dicta</span>
                  <div className="flex flex-wrap gap-2">
                    {materias.map((m) => (
                      <label
                        key={m.id}
                        className={`text-sm px-3 py-1 rounded-full border cursor-pointer ${
                          editMaterias.includes(m.id)
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300'
                        }`}
                      >
                        <input type="checkbox" className="hidden" onChange={() => toggleEditMateria(m.id)} />
                        {m.nombre}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={cerrarEdicion} className="px-4 py-2 text-sm text-gray-600">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoEdicion}
                  className="rounded-md bg-blue-600 px-5 py-2 text-white font-medium disabled:opacity-50"
                >
                  {guardandoEdicion ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
