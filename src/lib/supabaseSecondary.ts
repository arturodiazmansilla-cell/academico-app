import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Cliente secundario: se usa SOLO para crear nuevos usuarios (profesores)
// desde la pantalla de "Usuarios". No guarda sesión, así el administrador
// que está creando el usuario nuevo no pierde su propia sesión activa.
export const supabaseSecondary = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
