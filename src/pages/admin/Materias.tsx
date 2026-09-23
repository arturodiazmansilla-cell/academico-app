import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Materia } from '../../types/academico';
import { Info } from 'lucide-react';

export default function Materias() {
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [sigla, setSigla] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ids de materias que ya tienen actividades o sesiones de asistencia: no se pueden eliminar.
  const [enUso, setEnUso] = useState<Set<string>>(new Set());

  // Materia en edición (id) y sus valores temporales del formulario inline.
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editSigla, setEditSigla] = useState('');
  const [editDescripcion, setEditDescripcion] = useState('');
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    const { data, error } = await supabase.from('subjects').select('*').order('name');
    if (error) {
      setError(error.message);
      setCargando(false);
      return;
    }
    setMaterias(data ?? []);
    await revisarUso(data ?? []);
    setCargando(false);
  }

  // Averigua qué materias ya tienen actividades (evaluations) o asistencias (class_sessions)
  // para no ofrecer "Eliminar" sobre ellas y ahorrarle al profesor el intento fallido.
  async function revisarUso(lista: Materia[]) {
    if (lista.length === 0) { setEnUso(new Set()); return; }
    const ids = lista.map((m) => m.id);
    const [{ data: evals }, { data: sesiones }] = await Promise.all([
      supabase.from('evaluations').select('subject_id').in('subject_id', ids),
      supabase.from('class_sessions').select('subject_id').in('subject_id', ids),
    ]);
    const usados = new Set<string>();
    (evals ?? []).forEach((r: { subject_id: string }) => usados.add(r.subject_id));
    (sesiones ?? []).forEach((r: { subject_id: string }) => usados.add(r.subject_id));
    setEnUso(usados);
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;

    setGuardando(true);
    setError(null);

    const { error } = await supabase.from('subjects').insert({
      name: nombre.trim(),
      code: sigla.trim() || null,
      description: descripcion.trim() || null,
    });

    setGuardando(false);
    if (error) {
      setError(mensajeError(error, 'guardar'));
    } else {
      setNombre('');
      setSigla('');
      setDescripcion('');
      cargar();
    }
  }

  function empezarEdicion(materia: Materia) {
    setError(null);
    setEditandoId(materia.id);
    setEditNombre(materia.name);
    setEditSigla(materia.code || '');
    setEditDescripcion(materia.description || '');
  }

  function cancelarEdicion() {
    setEditandoId(null);
  }

  async function guardarEdicion(e: React.FormEvent, id: string) {
    e.preventDefault();
    if (!editNombre.trim()) return;

    setGuardandoEdicion(true);
    setError(null);

    const { error } = await supabase
      .from('subjects')
      .update({
        name: editNombre.trim(),
        code: editSigla.trim() || null,
        description: editDescripcion.trim() || null,
      })
      .eq('id', id);

    setGuardandoEdicion(false);
    if (error) {
      setError(mensajeError(error, 'guardar'));
    } else {
      setEditandoId(null);
      cargar();
    }
  }

  // Traduce los errores más comunes de Supabase a un mensaje que un profesor pueda entender.
  function mensajeError(error: { code?: string; message: string }, accion: 'eliminar' | 'guardar'): string {
    if (error.code === '23503') {
      return accion === 'eliminar'
        ? 'No se puede eliminar: esta materia ya tiene asistencias o notas registradas. Usa "Desactivar" para dejar de usarla sin perder ese historial.'
        : 'No se pudo guardar: hay datos relacionados con esta materia que impiden el cambio.';
    }
    if (error.code === '23505') {
      return 'Ya existe una materia con ese nombre o sigla.';
    }
    return error.message;
  }

  async function alternarActiva(materia: Materia) {
    setError(null);
    const { error } = await supabase.from('subjects').update({ active: !materia.active }).eq('id', materia.id);
    if (error) setError(mensajeError(error, 'guardar'));
    else cargar();
  }

  async function eliminar(materia: Materia) {
    setError(null);

    // Si la materia ya tiene actividades o asistencias, se advierte con la cantidad exacta
    // antes de borrar todo en cascada (útil para limpiar datos de prueba).
    if (enUso.has(materia.id)) {
      const { data: evals } = await supabase.from('evaluations').select('id').eq('subject_id', materia.id);
      const evalIds = (evals ?? []).map((e: { id: string }) => e.id);
      const { count: notasCount } = evalIds.length
        ? await supabase.from('grades').select('id', { count: 'exact', head: true }).in('evaluation_id', evalIds)
        : { count: 0 };

      const { data: sesiones } = await supabase.from('class_sessions').select('id').eq('subject_id', materia.id);
      const sesionIds = (sesiones ?? []).map((s: { id: string }) => s.id);
      const { count: asistCount } = sesionIds.length
        ? await supabase.from('attendance').select('id', { count: 'exact', head: true }).in('class_session_id', sesionIds)
        : { count: 0 };

      const aviso =
        `La materia "${materia.name}" ya tiene datos registrados:

` +
        `• ${evalIds.length} actividad(es) y ${notasCount ?? 0} nota(s)
` +
        `• ${sesionIds.length} sesión(es) de asistencia y ${asistCount ?? 0} registro(s) de asistencia

` +
        `Si continúas, TODO eso se eliminará junto con la materia y no se puede deshacer.
` +
        `¿Deseas continuar de todas formas?`;
      if (!confirm(aviso)) return;

      // Se borra de adentro hacia afuera para no chocar con las mismas llaves foráneas.
      if (evalIds.length) {
        const { error: e1 } = await supabase.from('grades').delete().in('evaluation_id', evalIds);
        if (e1) { setError('No se pudieron eliminar las notas: ' + e1.message); return; }
      }
      const { error: e2 } = await supabase.from('evaluations').delete().eq('subject_id', materia.id);
      if (e2) { setError('No se pudieron eliminar las actividades: ' + e2.message); return; }

      if (sesionIds.length) {
        const { error: e3 } = await supabase.from('attendance').delete().in('class_session_id', sesionIds);
        if (e3) { setError('No se pudo eliminar la asistencia: ' + e3.message); return; }
      }
      const { error: e4 } = await supabase.from('class_sessions').delete().eq('subject_id', materia.id);
      if (e4) { setError('No se pudieron eliminar las sesiones de asistencia: ' + e4.message); return; }
    } else {
      if (!confirm(`¿Eliminar la materia "${materia.name}"? Esto no se puede deshacer.`)) return;
    }

    // Puede haber otras tablas que también dependan de la materia (horarios, asignación de
    // profesores, etc.) además de notas y asistencia. En vez de adivinar cuáles son, se lee
    // el nombre de la tabla y la columna directamente del error de Postgres, se limpia esa
    // tabla y se reintenta. Se repite hasta que no quede ninguna dependencia (o hasta 8 vueltas,
    // como límite de seguridad para no quedar en un bucle infinito).
    for (let intento = 0; intento < 8; intento++) {
      const { error } = await supabase.from('subjects').delete().eq('id', materia.id);
      if (!error) { cargar(); return; }

      if (error.code !== '23503') {
        setError(mensajeError(error, 'eliminar'));
        return;
      }

      const m = error.message.match(/constraint "([a-zA-Z0-9_]+)" on table "([a-zA-Z0-9_]+)"/);
      const tabla = m?.[2];
      const columna = tabla && m?.[1].startsWith(tabla + '_') ? m[1].slice(tabla.length + 1, -'_fkey'.length) : null;
      if (!tabla || !columna) {
        setError(
          'No se pudo identificar automáticamente qué datos bloquean el borrado. Detalle técnico: ' + error.message
        );
        return;
      }

      const { error: eDep, count } = await supabase.from(tabla).delete({ count: 'exact' }).eq(columna, materia.id);
      if (eDep) {
        setError(`No se pudieron eliminar los datos relacionados en "${tabla}": ` + eDep.message);
        return;
      }
      if (!count) {
        // No se borró ninguna fila aunque debería haber. Lo más probable es que la
        // seguridad de la base de datos (RLS) esté impidiendo el borrado en esa tabla,
        // así que insistir no sirve: hay que resolverlo desde el SQL Editor de Supabase.
        setError(
          `No se puede eliminar: la tabla "${tabla}" tiene datos de esta materia que el sistema no tiene permiso de borrar. ` +
          `Pide al administrador del sistema que la elimine desde el SQL Editor de Supabase.`
        );
        return;
      }
      // vuelve a intentar borrar la materia en la siguiente vuelta del for
    }

    setError('No se pudo eliminar la materia: quedan demasiadas dependencias. Contacta al soporte técnico.');
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Materias</h1>

      {error && <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={crear} className="flex flex-wrap gap-3 mb-6">
        <input
          className="flex-1 min-w-[180px] rounded-md border border-gray-300 px-3 py-2"
          placeholder="Nombre de la materia (ej. Matemáticas)"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
        />
        <input
          className="w-28 rounded-md border border-gray-300 px-3 py-2"
          placeholder="Sigla"
          value={sigla}
          onChange={(e) => setSigla(e.target.value)}
        />
        <input
          className="flex-1 min-w-[180px] rounded-md border border-gray-300 px-3 py-2"
          placeholder="Descripción (opcional)"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
        <button
          type="submit"
          disabled={guardando}
          className="rounded-md bg-blue-600 px-4 py-2 text-white font-medium disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Agregar'}
        </button>
      </form>

      {cargando ? (
        <p className="text-gray-500">Cargando…</p>
      ) : materias.length === 0 ? (
        <p className="text-gray-500">Todavía no registraste ninguna materia.</p>
      ) : (
        <ul className="divide-y divide-gray-200 border rounded-md">
          {materias.map((m) =>
            editandoId === m.id ? (
              <li key={m.id} className="px-4 py-3 bg-blue-50/40">
                <form onSubmit={(e) => guardarEdicion(e, m.id)} className="flex flex-wrap gap-3">
                  <input
                    className="flex-1 min-w-[160px] rounded-md border border-gray-300 px-3 py-2"
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    required
                  />
                  <input
                    className="w-24 rounded-md border border-gray-300 px-3 py-2"
                    placeholder="Sigla"
                    value={editSigla}
                    onChange={(e) => setEditSigla(e.target.value)}
                  />
                  <input
                    className="flex-1 min-w-[160px] rounded-md border border-gray-300 px-3 py-2"
                    placeholder="Descripción"
                    value={editDescripcion}
                    onChange={(e) => setEditDescripcion(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={guardandoEdicion}
                      className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white font-medium disabled:opacity-50"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={cancelarEdicion}
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={m.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="font-medium">{m.name}</span>
                  {m.code && <span className="ml-2 text-sm text-gray-500">({m.code})</span>}
                  {!m.active && <span className="ml-2 text-xs text-gray-400">(inactiva)</span>}
                </div>
                <div className="flex gap-3 text-sm">
                  <button onClick={() => empezarEdicion(m)} className="text-blue-600 hover:underline">
                    Editar
                  </button>
                  <button onClick={() => alternarActiva(m)} className="text-blue-600 hover:underline">
                    {m.active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    onClick={() => eliminar(m)}
                    className="inline-flex items-center gap-1 text-red-600 hover:underline"
                    title={enUso.has(m.id) ? 'Ya tiene asistencias o notas registradas: se eliminarán también.' : undefined}
                  >
                    {enUso.has(m.id) && <Info className="h-3.5 w-3.5" />}
                    Eliminar
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}