-- ============================================================================
-- MIGRACIÓN: tablas, columnas e índices que el código usa y que faltan en
--            schema.sql
-- ============================================================================
-- Qué hace este script (solo AGREGA cosas, no borra ni cambia nada existente):
--
--   1. settings.teacher_can_import_grades   (permiso "Importar notas")
--   2. profiles.email                       (correo visible en "Usuarios")
--   3. courses.level                        (nivel: Inicial/Primario/Secundario)
--   4. class_sessions.academic_period_id    (trimestre de cada día de asistencia)
--   5. evaluations.dimension                (SER / SABER / HACER de cada actividad)
--   6. Tabla qualitative_ranges             (escala cualitativa: DP, DO, DA, ED…)
--   7. Tabla term_extras                    (autoevaluación y proyecto por trimestre)
--   8. Índices únicos que la app da por hechos (evitan duplicados)
--
-- Es seguro correrlo más de una vez: todo usa "IF NOT EXISTS" o comprueba
-- antes de crear. Si algo ya existe en tu base de datos, simplemente se omite.
--
-- Instrucciones: copia TODO este archivo, pégalo en
-- Supabase -> SQL Editor -> New query, y haz clic en Run.
-- Si ocurre un error, NO se aplica nada (todo va dentro de una transacción).
-- ============================================================================

begin;

-- ============================================================================
-- 1. SETTINGS: permiso para que el profesor importe notas desde Excel
-- ============================================================================
-- Lo leen SettingsContext.tsx (permissions.canImportGrades) y Configuracion.tsx
-- (interruptor "Importar notas"). Sin esta columna, la pantalla Configuración
-- falla al cargar los permisos porque la pide en su SELECT.
-- Por defecto queda desactivado, igual que los demás permisos.

alter table settings add column if not exists teacher_can_import_grades boolean not null default false;

-- ============================================================================
-- 2. PROFILES: correo del usuario
-- ============================================================================
-- Usuarios.tsx guarda el correo al crear un profesor
--   (update profiles set phone, email ...) y lo muestra en la lista.
-- Sin la columna, ese update falla en silencio y el teléfono tampoco se guarda.

alter table profiles add column if not exists email text;

-- 2a) Rellena el correo de los usuarios que ya existen, copiándolo desde
--     Supabase Auth. Solo toca filas donde email está vacío.
update profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is null;

-- 2b) Para los usuarios nuevos: cuando se crea su fila en profiles (la crea el
--     trigger handle_new_user, que NO se modifica), este trigger adicional copia
--     el correo desde auth.users si no vino informado.
create or replace function fill_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null then
    select u.email into new.email from auth.users u where u.id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fill_profile_email on profiles;
create trigger trg_fill_profile_email
  before insert on profiles
  for each row execute function fill_profile_email();

-- ============================================================================
-- 3. COURSES: nivel del curso
-- ============================================================================
-- CursosParalelos.tsx crea cursos con { name, level } y permite cambiar y
-- filtrar por nivel. Sin la columna, NO se puede crear ningún curso nuevo.
-- Los valores que ofrece la pantalla son: Inicial, Primario, Secundario.

alter table courses add column if not exists level text;

-- Restricción de valores permitidos. "NOT VALID" = solo se exige a partir de
-- ahora (filas nuevas o editadas); no revisa ni rechaza los cursos existentes.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'courses_level_check') then
    alter table courses
      add constraint courses_level_check
      check (level is null or level in ('Inicial', 'Primario', 'Secundario')) not valid;
  end if;
end $$;

-- ============================================================================
-- 4. CLASS_SESSIONS: trimestre al que pertenece cada día de asistencia
-- ============================================================================
-- Asistencia.tsx comprueba si esta columna existe y, si existe, guarda el
-- trimestre de la fecha al crear la sesión. Hoy funciona sin ella (la omite),
-- pero con la columna la asistencia queda vinculada a su trimestre.
-- Si se elimina un trimestre, la sesión NO se borra: solo queda sin trimestre.

alter table class_sessions
  add column if not exists academic_period_id uuid references academic_periods(id) on delete set null;

create index if not exists idx_class_sessions_period on class_sessions(academic_period_id);

-- ============================================================================
-- 5. EVALUATIONS: dimensión de la actividad (ser / saber / hacer)
-- ============================================================================
-- Notas.tsx, ImportarNotasModal.tsx, Reportes.tsx y reportesNotas.ts agrupan
-- las actividades por esta columna y la envían al crear cada actividad.
-- Sin ella, NO se puede crear ninguna actividad ni importar notas.
-- Se guarda en minúscula: 'ser', 'saber' o 'hacer'.

alter table evaluations add column if not exists dimension text;

-- "NOT VALID": no revisa las actividades que ya existan, solo las nuevas.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'evaluations_dimension_check') then
    alter table evaluations
      add constraint evaluations_dimension_check
      check (dimension is null or dimension in ('ser', 'saber', 'hacer')) not valid;
  end if;
end $$;

-- Acelera la consulta principal de Notas y Reportes
-- (materia + curso + paralelo + trimestre).
create index if not exists idx_evaluations_lookup
  on evaluations(subject_id, course_id, parallel_id, academic_period_id);

-- ============================================================================
-- 6. QUALITATIVE_RANGES: escala cualitativa de la calificación trimestral
-- ============================================================================
-- Configuracion.tsx: el administrador agrega/elimina rangos
--   (min_score, max_score, label, description, sort_order).
-- Notas.tsx y Reportes.tsx: buscan el rango que contiene la nota final para
--   mostrar la sigla (por ejemplo 85–100 = "DP").
-- La tabla se crea vacía: los rangos los carga el administrador desde
-- Configuración.

create table if not exists qualitative_ranges (
  id uuid primary key default gen_random_uuid(),
  min_score numeric not null,
  max_score numeric not null,
  label text not null,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint qualitative_ranges_min_max_check check (min_score <= max_score)
);

-- Por si la tabla ya existía con menos columnas: agrega las que falten.
alter table qualitative_ranges add column if not exists description text;
alter table qualitative_ranges add column if not exists sort_order int not null default 0;
alter table qualitative_ranges add column if not exists created_at timestamptz not null default now();

alter table qualitative_ranges enable row level security;

-- Lectura: cualquier usuario con sesión (los profesores la necesitan en Notas).
-- Escritura: solo el administrador (la pantalla Configuración es solo para admin).
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'qualitative_ranges' and policyname = 'qualitative_ranges_select') then
    create policy "qualitative_ranges_select" on qualitative_ranges
      for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'qualitative_ranges' and policyname = 'qualitative_ranges_write') then
    create policy "qualitative_ranges_write" on qualitative_ranges
      for all using (is_admin()) with check (is_admin());
  end if;
end $$;

-- ============================================================================
-- 7. TERM_EXTRAS: autoevaluación y proyecto de cada alumno por trimestre
-- ============================================================================
-- Notas.tsx y ImportarNotasModal.tsx guardan con upsert usando como clave
--   (student_id, subject_id, course_id, parallel_id, academic_period_id)
-- los campos self_evaluation, project_score y updated_at.
-- Reportes.tsx los lee para calcular la calificación trimestral.
-- Sin esta tabla, el botón "Guardar" de Notas falla siempre.

create table if not exists term_extras (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  parallel_id uuid not null references parallels(id) on delete cascade,
  academic_period_id uuid not null references academic_periods(id) on delete cascade,
  self_evaluation numeric,
  project_score numeric,
  -- Quién creó el registro. El código no lo envía: se llena solo con el
  -- usuario que hace la consulta. Se usa en las reglas de seguridad de abajo.
  registered_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Por si la tabla ya existía con menos columnas: agrega las que falten.
alter table term_extras add column if not exists self_evaluation numeric;
alter table term_extras add column if not exists project_score numeric;
alter table term_extras add column if not exists registered_by uuid references profiles(id) default auth.uid();
alter table term_extras add column if not exists created_at timestamptz not null default now();
alter table term_extras add column if not exists updated_at timestamptz not null default now();

-- Índice único obligatorio: el upsert (onConflict) de la app NO funciona sin él.
create unique index if not exists term_extras_unique_key
  on term_extras(student_id, subject_id, course_id, parallel_id, academic_period_id);

-- Acelera la consulta de Notas/Reportes (materia + curso + paralelo + trimestre).
create index if not exists idx_term_extras_lookup
  on term_extras(subject_id, course_id, parallel_id, academic_period_id);

alter table term_extras enable row level security;

-- Lectura: cualquier usuario con sesión (igual que grades).
-- Escritura: el administrador, quien creó el registro, o un profesor que tenga
-- actividades (evaluations) propias en esa misma materia/curso/paralelo/trimestre.
-- Nota: al crear un registro nuevo, registered_by = usuario actual, así que el
-- profesor siempre puede guardar los de sus alumnos por primera vez.
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'term_extras' and policyname = 'term_extras_select') then
    create policy "term_extras_select" on term_extras
      for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'term_extras' and policyname = 'term_extras_write') then
    create policy "term_extras_write" on term_extras for all
      using (
        is_admin()
        or registered_by = auth.uid()
        or exists (
          select 1 from evaluations e
          where e.teacher_id = auth.uid()
            and e.subject_id = term_extras.subject_id
            and e.course_id = term_extras.course_id
            and e.parallel_id = term_extras.parallel_id
            and e.academic_period_id = term_extras.academic_period_id
        )
      )
      with check (
        is_admin()
        or registered_by = auth.uid()
        or exists (
          select 1 from evaluations e
          where e.teacher_id = auth.uid()
            and e.subject_id = term_extras.subject_id
            and e.course_id = term_extras.course_id
            and e.parallel_id = term_extras.parallel_id
            and e.academic_period_id = term_extras.academic_period_id
        )
      );
  end if;
end $$;

-- ============================================================================
-- 8. ÍNDICES ÚNICOS QUE LA APP DA POR HECHOS
-- ============================================================================
-- Varias pantallas muestran mensajes como "Ya existe…" cuando la base de datos
-- responde con el error 23505 (registro duplicado), y Asistencia busca la
-- sesión del día esperando UNA sola fila. Esos índices no están en schema.sql.
--
-- IMPORTANTE: si ya hay datos duplicados, el índice no se puede crear. En ese
-- caso este script NO falla: muestra un aviso (NOTICE) en la pestaña de
-- resultados y continúa con lo demás. Se pueden limpiar los duplicados y
-- volver a correr el script.

-- 8a) Una sola sesión de clase por materia + curso + paralelo + fecha.
--     Lo esperan Asistencia.tsx (busca la sesión del día con maybeSingle),
--     HistorialAsistenciaModal.tsx (mensaje al cambiar la fecha) y el script
--     importar_asistencia_v2.py.
do $$
begin
  create unique index if not exists class_sessions_unique_day
    on class_sessions(subject_id, course_id, parallel_id, class_date);
exception when unique_violation then
  raise notice 'AVISO: no se creó class_sessions_unique_day porque hay sesiones duplicadas (misma materia, curso, paralelo y fecha).';
end $$;

-- 8b) Una sola actividad con la misma dimensión + título + fecha en la misma
--     materia/curso/paralelo/trimestre. Lo espera Notas.tsx al editar una
--     actividad ("Ya existe otra actividad igual"). El título se compara sin
--     distinguir mayúsculas ni espacios al inicio/final, igual que en la app.
do $$
begin
  create unique index if not exists evaluations_unique_activity
    on evaluations(subject_id, course_id, parallel_id, academic_period_id, dimension, lower(btrim(title)), evaluation_date);
exception when unique_violation then
  raise notice 'AVISO: no se creó evaluations_unique_activity porque hay actividades duplicadas.';
end $$;

-- 8c) Un solo alumno con el mismo apellido + nombre en el mismo curso/paralelo.
--     Lo espera Alumnos.tsx ("Ya existe un alumno con ese nombre en este curso
--     y paralelo"). No se aplica a filas con nombre o apellido vacío, porque la
--     importación desde Excel puede dejarlos vacíos si se desmarca ese campo.
do $$
begin
  create unique index if not exists students_unique_name_per_group
    on students(course_id, parallel_id, lower(btrim(last_name)), lower(btrim(first_name)))
    where btrim(first_name) <> '' and btrim(last_name) <> '';
exception when unique_violation then
  raise notice 'AVISO: no se creó students_unique_name_per_group porque hay alumnos repetidos en un mismo curso/paralelo.';
end $$;

commit;

-- ============================================================================
-- OPCIONAL (desactivado): permitir actividades de SER sin fecha
-- ============================================================================
-- En Notas.tsx, las actividades de SER se pueden guardar sin fecha (se envía
-- evaluation_date = null), pero en schema.sql esa columna es NOT NULL, así que
-- hoy ese caso falla con error. Esto MODIFICA una columna existente, por eso
-- está desactivado. Si quieres habilitarlo, quita los dos guiones "--" de la
-- línea siguiente y ejecútala por separado:
--
-- alter table evaluations alter column evaluation_date drop not null;

-- ============================================================================
-- VERIFICACIÓN (opcional, después de correr el script)
-- ============================================================================
-- select column_name from information_schema.columns
--   where table_name = 'settings' and column_name = 'teacher_can_import_grades';
-- select column_name from information_schema.columns
--   where table_name in ('profiles','courses','class_sessions','evaluations')
--     and column_name in ('email','level','academic_period_id','dimension');
-- select * from qualitative_ranges;
-- select count(*) from term_extras;
-- select indexname from pg_indexes
--   where indexname in ('term_extras_unique_key','class_sessions_unique_day',
--                       'evaluations_unique_activity','students_unique_name_per_group');

-- ============================================================================
-- FIN DE LA MIGRACIÓN
-- ============================================================================
