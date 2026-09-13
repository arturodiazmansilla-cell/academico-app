// netlify/functions/crear-profesor.js
//
// Crea un profesor: (1) cuenta de acceso en Supabase Auth,
// (2) fila en public.profiles con role 'teacher',
// (3) asignación de materias en public.profesor_materias.
//
// Se ejecuta en el SERVIDOR de Netlify, nunca en el navegador, porque
// necesita la SUPABASE_SERVICE_ROLE_KEY para poder crear usuarios.
//
// CONFIGURACIÓN NECESARIA en Netlify (Site settings → Environment variables):
//   SUPABASE_URL              = https://spzhitlzusxunmcsoruz.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY = (Settings → API → "service_role" key. ¡SECRETA, no la anon key!)

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Método no permitido' };
  }

  try {
    // 1. Verificar que quien llama está autenticado y es admin.
    const authHeader = event.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return { statusCode: 401, body: JSON.stringify({ error: 'No autenticado' }) };
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Token inválido' }) };
    }

    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    if (perfilError || perfil?.role !== 'admin') {
      return { statusCode: 403, body: JSON.stringify({ error: 'Solo un administrador puede crear profesores' }) };
    }

    // 2. Leer y validar los datos del formulario.
    const { full_name, email, password, phone, materias_ids } = JSON.parse(event.body || '{}');

    if (!full_name || !email || !password) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Faltan campos obligatorios: nombre, correo o contraseña' }) };
    }
    if (password.length < 8) {
      return { statusCode: 400, body: JSON.stringify({ error: 'La contraseña temporal debe tener al menos 8 caracteres' }) };
    }

    // 3. Crear la cuenta en Supabase Auth (ya confirmada, sin esperar email).
    const { data: nuevoAuthUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      return { statusCode: 400, body: JSON.stringify({ error: createError.message }) };
    }

    const nuevoId = nuevoAuthUser.user.id;

    // 4. Crear el perfil en public.profiles con role 'teacher'.
    const { error: perfilInsertError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: nuevoId,
        full_name,
        email,
        phone: phone || null,
        role: 'teacher',
        active: true,
      });

    if (perfilInsertError) {
      // Si falla el perfil, revertimos la cuenta de auth para no dejar usuarios huérfanos.
      await supabaseAdmin.auth.admin.deleteUser(nuevoId);
      return { statusCode: 400, body: JSON.stringify({ error: perfilInsertError.message }) };
    }

    // 5. Asignar materias (opcional, puede venir vacío en el beta).
    if (Array.isArray(materias_ids) && materias_ids.length > 0) {
      const filas = materias_ids.map((materia_id) => ({ profesor_id: nuevoId, materia_id }));
      const { error: materiasError } = await supabaseAdmin.from('profesor_materias').insert(filas);
      if (materiasError) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            ok: true,
            id: nuevoId,
            aviso: 'El profesor se creó, pero hubo un problema asignando materias: ' + materiasError.message,
          }),
        };
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, id: nuevoId }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Error inesperado' }) };
  }
};
