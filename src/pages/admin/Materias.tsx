import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Materia } from '../../types/academico';

export default function Materias() {
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [sigla, setSigla] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    const { data, error } = await supabase.from('materias').select('*').order('nombre');
    if (error) setError(error.message);
    else setMaterias(data ?? []);
    setCargando(false);
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;

    setGuardando(true);
    setError(null);

    const { error } = await supabase.from('materias').insert({ nombre: nombre.trim(), sigla: sigla.trim() || null });

    setGuardando(false);
    if (error) {
      setError(error.message);
    } else {
      setNombre('');
      setSigla('');
      cargar();
    }
  }

  async function alternarActiva(materia: Materia) {
    const { error } = await supabase.from('materias').update({ activa: !materia.activa }).eq('id', materia.id);
    if (error) setError(error.message);
    else cargar();
  }

  async function eliminar(materia: Materia) {
    if (!confirm(`¿Eliminar la materia "${materia.nombre}"? Esto no se puede deshacer.`)) return;
    const { error } = await supabase.from('materias').delete().eq('id', materia.id);
    if (error) setError(error.message);
    else cargar();
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Materias</h1>

      {error && <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={crear} className="flex gap-3 mb-6">
        <input
          className="flex-1 rounded-md border border-gray-300 px-3 py-2"
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
        <button
          type="submit"
          disabled={guardando}
          className="rounded-md bg-blue-600 px-4 py-2 text-white font-medium disabled:opacity-50"
        >
          Agregar
        </button>
      </form>

      {cargando ? (
        <p className="text-gray-500">Cargando…</p>
      ) : materias.length === 0 ? (
        <p className="text-gray-500">Todavía no registraste ninguna materia.</p>
      ) : (
        <ul className="divide-y divide-gray-200 border rounded-md">
          {materias.map((m) => (
            <li key={m.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="font-medium">{m.nombre}</span>
                {m.sigla && <span className="ml-2 text-sm text-gray-500">({m.sigla})</span>}
                {!m.activa && <span className="ml-2 text-xs text-gray-400">(inactiva)</span>}
              </div>
              <div className="flex gap-3 text-sm">
                <button onClick={() => alternarActiva(m)} className="text-blue-600 hover:underline">
                  {m.activa ? 'Desactivar' : 'Activar'}
                </button>
                <button onClick={() => eliminar(m)} className="text-red-600 hover:underline">
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
