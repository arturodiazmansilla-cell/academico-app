# Sistema Académico — Guía de instalación (sin conocimientos técnicos)

Esta aplicación es una sola página web que se adapta sola a computadora, tablet y
celular (no son dos programas distintos). Incluye: Panel, Alumnos (con importación
desde Excel), Asistencia, Kardex (con exportación a PDF y Excel), Notas, Citaciones
(PDF), Estudiantes en riesgo, Cursos, Usuarios y Configuración.

Sigue estos pasos EN ORDEN. No necesitas saber programación ni usar la línea de
comandos de Supabase.

---

## PARTE 1 — Crear la base de datos en Supabase

1. Entra a [supabase.com](https://supabase.com), inicia sesión y crea un proyecto
   nuevo (o usa uno que ya tengas). Elige cualquier nombre y contraseña de base de
   datos (guárdala, no la necesitarás de nuevo para esto).

2. En el menú izquierdo, entra a **SQL Editor**.

3. Haz clic en **New query**.

4. Abre el archivo `supabase/schema.sql` que viene en este ZIP, copia **todo** su
   contenido, y pégalo en el cuadro del SQL Editor.

5. Haz clic en **Run**. Debe decir "Success". Con esto quedan creadas todas las
   tablas, la seguridad y las reglas — no necesitas tocar nada más aquí.

---

## PARTE 2 — Crear tu usuario administrador (el único que crearás manualmente)

6. En el menú izquierdo, entra a **Authentication → Users**.

7. Haz clic en **Add user** (o "Add user" → "Create new user").

8. Escribe el correo y la contraseña con los que vas a entrar como administrador,
   y guarda. (No necesitas activar "Send invitation" ni nada adicional).

9. Vuelve a **SQL Editor → New query**.

10. Abre el archivo `supabase/promover_admin.sql` de este ZIP, copia su contenido,
    y **reemplaza** el correo de ejemplo por el correo exacto que usaste en el
    paso 8.

11. Pega ese código en el SQL Editor y haz clic en **Run**.

Con esto, ese usuario ya puede entrar al sistema como Administrador. Si en el
futuro necesitas más profesores, ya NO necesitas volver a Supabase — se crean
desde dentro del sistema, en la pantalla "Usuarios" (ver Parte 5).

---

## PARTE 3 — Obtener tus dos datos de conexión

12. En Supabase, entra a **Settings → API** (el ícono de engranaje, abajo a la
    izquierda).

13. Copia estos dos valores, los vas a necesitar en la Parte 4:
    - **Project URL**
    - **anon public** key (también llamada "Publishable key")

---

## PARTE 4 — Conectar la aplicación

### Si vas a probarla en tu computadora antes de publicarla:

14. Dentro de la carpeta del proyecto, busca el archivo `.env.example`, haz una
    copia y renómbrala a `.env`.
15. Ábrelo con cualquier editor de texto y pega tus dos datos así:

```
VITE_SUPABASE_URL=https://tuproyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-larga-aqui
```

### Si la vas a publicar directo en Netlify (recomendado):

En Netlify no se sube el archivo `.env` — esos dos datos se configuran como
"variables de entorno" dentro del panel de Netlify (ver Parte 6).

---

## PARTE 5 — Cómo funciona la creación de nuevos usuarios (profesores)

Una vez que entres al sistema con tu usuario administrador:

1. Ve al menú **Usuarios**.
2. Llena el formulario: nombre completo, correo, contraseña temporal.
3. Haz clic en **Crear usuario**.
4. Ese profesor ya puede entrar con ese correo y contraseña.

Nota: por defecto, Supabase puede pedirle a la persona nueva que confirme su
correo antes de entrar por primera vez (le llega un correo con un enlace). Si NO
quieres ese paso y prefieres que entre de inmediato, ve en Supabase a
**Authentication → Providers → Email** y desactiva la opción **"Confirm email"**.
Esto es opcional, no es obligatorio para que el sistema funcione.

---

## PARTE 6 — Publicar en Netlify

1. Sube esta carpeta a un repositorio de GitHub (o usa la opción de Netlify de
   arrastrar y soltar la carpeta, si no quieres usar GitHub).
2. En [netlify.com](https://netlify.com), crea un nuevo sitio a partir de ese
   repositorio (o arrastra la carpeta).
3. Netlify va a detectar automáticamente la configuración (ya viene incluida en
   el archivo `netlify.toml`): comando `npm run build`, carpeta `dist`.
4. Antes de publicar (o después, en **Site settings → Environment variables**),
   agrega estas dos variables con tus datos de la Parte 3:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Haz clic en **Deploy**. Cuando termine, tu sistema ya está en línea.

---

## Sobre imágenes y archivos (buckets de Supabase)

**No necesitas crear ningún bucket de almacenamiento.** El logo de la institución
se guarda directamente en la base de datos como una imagen pequeña incrustada
(recomendado: menos de 400 KB). Esto simplifica la configuración — no hay ningún
paso extra de Storage que configurar.

---

## Resumen rápido (lista corta)

**En Supabase:**
1. Crear proyecto.
2. SQL Editor → pegar y ejecutar `schema.sql`.
3. Authentication → Users → Add user (crear el correo/contraseña del admin).
4. SQL Editor → pegar `promover_admin.sql` (con tu correo) → Run.
5. Settings → API → copiar Project URL y anon key.
6. (Opcional) Authentication → Providers → Email → desactivar "Confirm email".

**En Netlify:**
1. Subir el proyecto (GitHub o arrastrar carpeta).
2. Agregar las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. Deploy.
4. Entrar con el correo y contraseña del administrador.

---

## Módulos incluidos

Panel · Alumnos (alta manual e importación desde Excel con detección de
duplicados) · Asistencia · Kardex (con exportación a PDF y Excel tamaño carta) ·
Notas y Evaluaciones (con promedio ponderado) · Citaciones (PDF imprimible) ·
Estudiantes en riesgo (calculado con datos reales) · Cursos y Paralelos ·
Usuarios · Configuración (nombre de la institución, logo y datos del docente).

## Próximos pasos posibles (no incluidos todavía)

Horarios, Calendario académico, reportes adicionales en PDF/Excel más allá de
kardex, y promoción automática de curso entre gestiones. Se pueden agregar más
adelante sobre esta misma base.
