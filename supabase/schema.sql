-- ============================================================================
-- SISTEMA ACADÉMICO — SCRIPT ÚNICO DE BASE DE DATOS
-- ============================================================================
-- Instrucciones: copia TODO este archivo y pégalo una sola vez en
-- Supabase -> SQL Editor -> New query -> Run.
-- No necesitas modificar nada de este archivo.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. PERFILES (vinculados a los usuarios de autenticación de Supabase)
-- ============================================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'teacher' check (role in ('admin', 'teacher')),
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Función auxiliar: ¿el usuario que hace la consulta es administrador?
create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Cuando alguien crea una cuenta nueva en Supabase Auth, se crea automáticamente
-- su fila en "profiles" con rol "teacher" por defecto.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'teacher',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Evita que un profesor se auto-asigne el rol de administrador
create or replace function prevent_role_escalation()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.role is distinct from old.role and not is_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_escalation on profiles;
create trigger trg_prevent_role_escalation
  before update on profiles
  for each row execute function prevent_role_escalation();

create policy "profiles_select" on profiles
  for select using (auth.uid() is not null);

create policy "profiles_update" on profiles
  for update using (id = auth.uid() or is_admin())
  with check (id = auth.uid() or is_admin());

-- ============================================================================
-- 2. CONFIGURACIÓN GENERAL (nombre de la institución y logo)
-- ============================================================================

create table if not exists settings (
  id smallint primary key default 1 check (id = 1),
  institution_name text not null default 'Mi Unidad Educativa',
  logo_data_url text,
  theme_bg_color text,
  theme_sidebar_color text,
  theme_font_color text,
  theme_font_size int,
  teacher_can_import_students boolean not null default false,
  teacher_can_manage_subjects boolean not null default false,
  teacher_can_assign_subjects boolean not null default false,
  teacher_can_manage_courses boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into settings (id, institution_name) values (1, 'Mi Unidad Educativa')
  on conflict (id) do nothing;

alter table settings enable row level security;

-- Cualquier persona puede leerlo (incluso antes de iniciar sesión, para mostrar
-- el logo y el nombre en la pantalla de acceso).
create policy "settings_select_public" on settings
  for select using (true);

create policy "settings_update_admin" on settings
  for update using (is_admin()) with check (is_admin());

-- ============================================================================
-- 3. CURSOS Y PARALELOS
-- ============================================================================

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists parallels (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (course_id, name)
);

alter table courses enable row level security;
alter table parallels enable row level security;

create policy "courses_select" on courses for select using (auth.uid() is not null);
create policy "courses_write" on courses for all
  using (
    auth.uid() is not null and (
      is_admin() or (select coalesce(teacher_can_manage_courses, false) from settings where id = 1)
    )
  )
  with check (
    auth.uid() is not null and (
      is_admin() or (select coalesce(teacher_can_manage_courses, false) from settings where id = 1)
    )
  );

create policy "parallels_select" on parallels for select using (auth.uid() is not null);
create policy "parallels_write" on parallels for all
  using (
    auth.uid() is not null and (
      is_admin() or (select coalesce(teacher_can_manage_courses, false) from settings where id = 1)
    )
  )
  with check (
    auth.uid() is not null and (
      is_admin() or (select coalesce(teacher_can_manage_courses, false) from settings where id = 1)
    )
  );

-- ============================================================================
-- 4. ESTUDIANTES
-- ============================================================================

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  student_code text unique,      -- Código RUDE u otro código oficial
  carnet text,
  first_name text not null default '',
  last_name text not null default '',
  birth_date date,
  gender text,
  birthplace text,
  course_id uuid references courses(id),
  parallel_id uuid references parallels(id),
  father_name text,
  father_phone text,
  mother_name text,
  mother_phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_students_course_parallel on students(course_id, parallel_id);

alter table students enable row level security;

create policy "students_select" on students for select using (auth.uid() is not null);
create policy "students_write" on students for all
  using (
    auth.uid() is not null and (
      is_admin() or (select coalesce(teacher_can_import_students, false) from settings where id = 1)
    )
  )
  with check (
    auth.uid() is not null and (
      is_admin() or (select coalesce(teacher_can_import_students, false) from settings where id = 1)
    )
  );

-- ============================================================================
-- 5. MATERIAS Y ASIGNACIÓN A PROFESORES
-- ============================================================================

create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists teacher_subjects (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  parallel_id uuid not null references parallels(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (teacher_id, subject_id, course_id, parallel_id)
);

alter table subjects enable row level security;
alter table teacher_subjects enable row level security;

create policy "subjects_select" on subjects for select using (auth.uid() is not null);
create policy "subjects_write" on subjects for all using (is_admin()) with check (is_admin());

create policy "teacher_subjects_select" on teacher_subjects for select using (auth.uid() is not null);
create policy "teacher_subjects_write" on teacher_subjects for all using (is_admin()) with check (is_admin());

-- ============================================================================
-- 6. HORARIOS Y SESIONES DE CLASE
-- ============================================================================

create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references subjects(id),
  teacher_id uuid references profiles(id),
  course_id uuid references courses(id),
  parallel_id uuid references parallels(id),
  day_of_week smallint check (day_of_week between 1 and 7),
  start_time time,
  end_time time,
  classroom text,
  active boolean not null default true
);

create table if not exists class_sessions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references subjects(id),
  teacher_id uuid references profiles(id),
  course_id uuid references courses(id),
  parallel_id uuid references parallels(id),
  class_date date not null default current_date,
  start_time time,
  observation text,
  created_at timestamptz not null default now()
);

alter table schedules enable row level security;
alter table class_sessions enable row level security;

create policy "schedules_select" on schedules for select using (auth.uid() is not null);
create policy "schedules_write" on schedules for all
  using (is_admin() or teacher_id = auth.uid())
  with check (is_admin() or teacher_id = auth.uid());

create policy "class_sessions_select" on class_sessions for select using (auth.uid() is not null);
create policy "class_sessions_write" on class_sessions for all
  using (is_admin() or teacher_id = auth.uid())
  with check (is_admin() or teacher_id = auth.uid());

-- ============================================================================
-- 7. ASISTENCIA
-- ============================================================================

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  class_session_id uuid not null references class_sessions(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  status text not null check (status in ('present', 'absent', 'late', 'leave')),
  observation text,
  registered_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (class_session_id, student_id)
);

create index if not exists idx_attendance_class_session on attendance(class_session_id);
create index if not exists idx_attendance_student on attendance(student_id);

alter table attendance enable row level security;

create policy "attendance_select" on attendance for select using (auth.uid() is not null);
create policy "attendance_write" on attendance for all
  using (
    is_admin() or exists (
      select 1 from class_sessions cs
      where cs.id = attendance.class_session_id and cs.teacher_id = auth.uid()
    )
  )
  with check (
    is_admin() or exists (
      select 1 from class_sessions cs
      where cs.id = attendance.class_session_id and cs.teacher_id = auth.uid()
    )
  );

-- ============================================================================
-- 8. PERIODOS ACADÉMICOS Y TIPOS DE EVALUACIÓN
-- ============================================================================

create table if not exists academic_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year int not null default extract(year from current_date),
  start_date date,
  end_date date,
  active boolean not null default true
);

create table if not exists evaluation_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true
);

insert into evaluation_types (name) values
  ('Prueba'), ('Práctica'), ('Tarea'), ('Exposición'), ('Proyecto')
  on conflict (name) do nothing;

alter table academic_periods enable row level security;
alter table evaluation_types enable row level security;

create policy "academic_periods_select" on academic_periods for select using (auth.uid() is not null);
create policy "academic_periods_write" on academic_periods for all using (is_admin()) with check (is_admin());

create policy "evaluation_types_select" on evaluation_types for select using (auth.uid() is not null);
create policy "evaluation_types_write" on evaluation_types for all using (is_admin()) with check (is_admin());

-- ============================================================================
-- 9. EVALUACIONES Y NOTAS
-- ============================================================================

create table if not exists evaluations (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references subjects(id),
  teacher_id uuid references profiles(id),
  course_id uuid references courses(id),
  parallel_id uuid references parallels(id),
  evaluation_type_id uuid references evaluation_types(id),
  title text not null,
  evaluation_date date not null default current_date,
  maximum_score numeric not null default 100,
  weight numeric not null default 0,
  description text,
  academic_period_id uuid references academic_periods(id),
  created_at timestamptz not null default now()
);

create table if not exists grades (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references evaluations(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  score numeric,
  observation text,
  registered_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (evaluation_id, student_id)
);

create index if not exists idx_grades_evaluation on grades(evaluation_id);
create index if not exists idx_grades_student on grades(student_id);

alter table evaluations enable row level security;
alter table grades enable row level security;

create policy "evaluations_select" on evaluations for select using (auth.uid() is not null);
create policy "evaluations_write" on evaluations for all
  using (is_admin() or teacher_id = auth.uid())
  with check (is_admin() or teacher_id = auth.uid());

create policy "grades_select" on grades for select using (auth.uid() is not null);
create policy "grades_write" on grades for all
  using (
    is_admin() or exists (
      select 1 from evaluations e
      where e.id = grades.evaluation_id and e.teacher_id = auth.uid()
    )
  )
  with check (
    is_admin() or exists (
      select 1 from evaluations e
      where e.id = grades.evaluation_id and e.teacher_id = auth.uid()
    )
  );

-- ============================================================================
-- 10. CALENDARIO ACADÉMICO
-- ============================================================================

create table if not exists academic_calendar (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  type text not null check (type in ('holiday', 'suspension', 'activity', 'other')),
  description text
);

alter table academic_calendar enable row level security;

create policy "academic_calendar_select" on academic_calendar for select using (auth.uid() is not null);
create policy "academic_calendar_write" on academic_calendar for all using (is_admin()) with check (is_admin());

-- ============================================================================
-- 11. CITACIONES
-- ============================================================================

create table if not exists citations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  teacher_id uuid references profiles(id),
  citation_date date not null default current_date,
  citation_time time,
  reason text,
  observation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table citations enable row level security;

create policy "citations_select" on citations for select
  using (is_admin() or teacher_id = auth.uid());
create policy "citations_write" on citations for all
  using (is_admin() or teacher_id = auth.uid())
  with check (is_admin() or teacher_id = auth.uid());

-- ============================================================================
-- 12. KARDEX (faltas / indisciplina)
-- ============================================================================

create table if not exists kardex (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  teacher_id uuid references profiles(id),
  incident_date date not null default current_date,
  type text not null,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_kardex_student on kardex(student_id);

alter table kardex enable row level security;

create policy "kardex_select" on kardex for select
  using (is_admin() or teacher_id = auth.uid());
create policy "kardex_write" on kardex for all
  using (is_admin() or teacher_id = auth.uid())
  with check (is_admin() or teacher_id = auth.uid());

-- ============================================================================
-- FIN DEL SCRIPT — no necesitas escribir nada más aquí.
-- ============================================================================
