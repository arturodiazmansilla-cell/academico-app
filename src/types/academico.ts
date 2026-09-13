export interface Institucion {
  id: number;
  nombre: string;
  codigo_sie: string | null;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  director: string | null;
  logo_base64: string | null;
  anio_lectivo: string | null;
  updated_at: string;
}

export interface Materia {
  id: string;
  nombre: string;
  sigla: string | null;
  activa: boolean;
  created_at: string;
}

// Coincide con la tabla real public.profiles
export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: 'admin' | 'teacher';
  active: boolean;
  created_at: string;
}
