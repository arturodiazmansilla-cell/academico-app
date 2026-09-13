-- ============================================================================
-- MIGRACIÓN: permitir que el Profesor gestione Cursos/Paralelos y Alumnos
-- ============================================================================
-- Qué hace este script:
--   1. Agrega las columnas de configuración que la app ya usa mostrando
--      la pantalla "Configuración" pero que todavía no existían en la base
--      de datos (tema visual y permisos de profesores). Es seguro correrlo
--      aunque algunas ya existan (usa "IF NOT EXISTS").
--   2. Agrega una columna nueva: teacher_can_manage_courses.
--   3. Actualiza las reglas de seguridad (RLS) de "courses", "parallels" y
--      "students" para que, cuando el administrador active el permiso
--      correspondiente en Configuración, el profesor también pueda crear/
--      editar/eliminar esos registros (antes solo el admin podía, sin
--      importar lo que dijera el interruptor en pantalla).
--
-- Instrucciones: copia TODO este archivo, pégalo en
-- Supabase -> SQL Editor -> New query, y haz clic en Run.
-- ============================================================================

-- 1) Columnas de configuración (idempotente: no rompe nada si ya existen)
alter table settings add column if not exists theme_bg_color text;
alter table settings add column if not exists theme_sidebar_color text;
alter table settings add column if not exists theme_font_color text;
alter table settings add column if not exists theme_font_size int;
alter table settings add column if not exists teacher_can_import_students boolean not null default false;
alter table settings add column if not exists teacher_can_manage_subjects boolean not null default false;
alter table settings add column if not exists teacher_can_assign_subjects boolean not null default false;
alter table settings add column if not exists teacher_can_manage_courses boolean not null default false;

-- 2) Cursos y Paralelos: el profesor puede escribir si el admin activó el permiso
drop policy if exists "courses_write" on courses;
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

drop policy if exists "parallels_write" on parallels;
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

-- 3) Alumnos: el profesor puede escribir (alta manual e importar Excel) si el
--    admin activó "Importar alumnos desde Excel" en Configuración. Esto
--    también corrige un permiso que ya existía en pantalla pero que la base
--    de datos todavía no respetaba.
drop policy if exists "students_write" on students;
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
-- FIN DE LA MIGRACIÓN
-- ============================================================================
