-- ============================================================================
-- CONVERTIR UN USUARIO EN ADMINISTRADOR
-- ============================================================================
-- Usa esto DESPUÉS de:
--   1) haber ejecutado schema.sql, y
--   2) haber creado el usuario en Authentication -> Users -> Add user.
--
-- Reemplaza el correo de abajo por el correo exacto que usaste al crear
-- el usuario, y ejecuta este bloque en el SQL Editor.
-- ============================================================================

update profiles
set role = 'admin'
where id = (
  select id from auth.users where email = 'arturodiazmansillamusic@gamil.com'
);
