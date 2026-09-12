// netlify/functions/resetear-clave.js
//
// Cambia la contraseña de un usuario existente. Se ejecuta en el SERVIDOR
// porque necesita la SUPABASE_SERVICE_ROLE_KEY (misma variable que ya
// configuraste para crear-profesor.js).

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Método no permitido' };
  }

  try {
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
      return { statusCode: 403, body: JSON.stringify({ error: 'Solo un administrador puede resetear contraseñas' }) };
    }

    const { user_id, new_password } = JSON.parse(event.body || '{}');

    if (!user_id || !new_password) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos: usuario o nueva contraseña' }) };
    }
    if (new_password.length < 6) {
      return { statusCode: 400, body: JSON.stringify({ error: 'La contraseña debe tener al menos 6 caracteres' }) };
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password: new_password,
    });

    if (updateError) {
      return { statusCode: 400, body: JSON.stringify({ error: updateError.message }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Error inesperado' }) };
  }
};
