import { useEffect, useState } from 'react';
// AJUSTA esta ruta a donde tengas tu cliente de Supabase, ej:
// import { supabase } from '../../lib/supabaseClient';
import { supabase } from '../../lib/supabaseClient';
import type { Institucion } from '../../types/academico';

const MAX_LOGO_KB = 400;

export default function ConfiguracionInstitucion() {
  const [form, setForm] = useState<Partial<Institucion>>({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    setCargando(true);
    const { data, error } = await supabase.from('institucion').select('*').eq('id', 1).single();
    if (error) {
      setMensaje({ tipo: 'error', texto: 'No se pudo cargar la información: ' + error.message });
    } else {
      setForm(data);
    }
    setCargando(false);
  }

  function handleChange(campo: keyof Institucion, valor: string) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    if (archivo.size / 1024 > MAX_LOGO_KB) {
      setMensaje({ tipo: 'error', texto: `El logo debe pesar menos de ${MAX_LOGO_KB} KB.` });
      return;
    }

    const lector = new FileReader();
    lector.onload = () => {
      setForm((prev) => ({ ...prev, logo_base64: lector.result as string }));
    };
    lector.readAsDataURL(archivo);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setMensaje(null);

    const { error } = await supabase
      .from('institucion')
      .update({
        nombre: form.nombre,
        codigo_sie: form.codigo_sie,
        direccion: form.direccion,
        telefono: form.telefono,
        email: form.email,
        director: form.director,
        logo_base64: form.logo_base64,
        anio_lectivo: form.anio_lectivo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    setGuardando(false);
    if (error) {
      setMensaje({ tipo: 'error', texto: 'Error al guardar: ' + error.message });
    } else {
      setMensaje({ tipo: 'ok', texto: 'Datos guardados correctamente.' });
    }
  }

  if (cargando) return <p className="p-6 text-gray-500">Cargando…</p>;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Datos de la Unidad Educativa</h1>

      {mensaje && (
        <div
          className={`mb-4 rounded-md px-4 py-3 text-sm ${
            mensaje.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      <form onSubmit={guardar} className="space-y-4">
        <Campo label="Nombre de la institución *">
          <input
            required
            className="input"
            value={form.nombre ?? ''}
            onChange={(e) => handleChange('nombre', e.target.value)}
          />
        </Campo>

        <Campo label="Código SIE (opcional)">
          <input
            className="input"
            value={form.codigo_sie ?? ''}
            onChange={(e) => handleChange('codigo_sie', e.target.value)}
          />
        </Campo>

        <Campo label="Dirección">
          <input
            className="input"
            value={form.direccion ?? ''}
            onChange={(e) => handleChange('direccion', e.target.value)}
          />
        </Campo>

        <div className="grid grid-cols-2 gap-4">
          <Campo label="Teléfono">
            <input
              className="input"
              value={form.telefono ?? ''}
              onChange={(e) => handleChange('telefono', e.target.value)}
            />
          </Campo>
          <Campo label="Correo institucional">
            <input
              type="email"
              className="input"
              value={form.email ?? ''}
              onChange={(e) => handleChange('email', e.target.value)}
            />
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Campo label="Director(a) / Rector(a)">
            <input
              className="input"
              value={form.director ?? ''}
              onChange={(e) => handleChange('director', e.target.value)}
            />
          </Campo>
          <Campo label="Año lectivo">
            <input
              className="input"
              placeholder="2026"
              value={form.anio_lectivo ?? ''}
              onChange={(e) => handleChange('anio_lectivo', e.target.value)}
            />
          </Campo>
        </div>

        <Campo label={`Logo (máx. ${MAX_LOGO_KB} KB)`}>
          <input type="file" accept="image/*" onChange={handleLogo} />
          {form.logo_base64 && (
            <img src={form.logo_base64} alt="Logo actual" className="mt-3 h-20 w-20 object-contain border rounded" />
          )}
        </Campo>

        <button
          type="submit"
          disabled={guardando}
          className="mt-4 rounded-md bg-blue-600 px-5 py-2 text-white font-medium disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      {children}
    </label>
  );
}

// Si no usas una clase global ".input", reemplaza className="input" arriba por:
// className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
