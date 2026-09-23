// Coincide con la tabla real public.subjects
export interface Materia {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  active: boolean;
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
