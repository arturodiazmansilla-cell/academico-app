"""
Importa asistencia desde un Excel de control (formato "ASIST Nº") hacia Supabase.
Versión genérica: sirve para cualquier curso/paralelo/materia/profesor, indicando
los datos por línea de comandos en vez de tenerlos fijos en el código.

CÓMO USARLO
-----------
1. Instala las dependencias (una sola vez):
       pip install supabase openpyxl

2. Define la contraseña del profesor que va a "firmar" la asistencia
   (NUNCA la escribas dentro de este archivo).
   Windows (PowerShell):
       $env:TEACHER_PASSWORD = "la_contraseña_real"
   Mac/Linux:
       export TEACHER_PASSWORD="la_contraseña_real"

3. Primero corre en modo de PRUEBA (no escribe nada en la base de datos):

   python importar_asistencia_v2.py ^
       --excel "ruta\\al\\1SEC_A.xlsx" ^
       --curso "1RO SECUNDARIA" ^
       --paralelo "A" ^
       --materia "Computación" ^
       --profesor-email "arturodiazmansilla@gmail.com" ^
       --hoja "ASIST 3º" ^
       --dry-run

   Revisa la salida con cuidado antes de continuar.

4. Si todo se ve bien, corre exactamente el mismo comando SIN --dry-run.

Puedes correrlo las veces que quieras: usa upsert, así que si ya existe un
registro de asistencia para un alumno+fecha, lo actualiza en vez de duplicarlo.

NOTAS
-----
- El script detecta automáticamente las columnas de fecha de la fila 6 del
  Excel y SOLO importa las que ya tienen algún dato cargado (no crea sesiones
  vacías para fechas futuras).
- Si algún alumno del Excel no se encuentra en el sistema por una diferencia
  de nombre (typo, apellido distinto, etc.), agrégalo a ALIASES_NOMBRES más
  abajo con el nombre tal cual está en el sistema.
"""

import argparse
import os
import sys
import unicodedata
from datetime import date, datetime

try:
    import openpyxl
except ImportError:
    sys.exit("Falta la librería openpyxl. Instálala con: pip install openpyxl")

try:
    from supabase import create_client
except ImportError:
    sys.exit("Falta la librería supabase. Instálala con: pip install supabase")


# ---------------------------------------------------------------------------
# CONFIGURACIÓN FIJA — datos del proyecto Supabase (no cambian entre cursos)
# ---------------------------------------------------------------------------

SUPABASE_URL = "https://spzhitlzusxunmcsoruz.supabase.co"
SUPABASE_KEY = "sb_publishable_QH8BDFeAshkRZ_rAiyS2mQ_0mEGVaPA"

FIRST_STUDENT_ROW = 7
NAME_COLUMN = 2          # columna B = "Apellidos, Nombres"
DATE_HEADER_ROW = 6      # fila donde están las fechas de cada semana
FIRST_DATE_COLUMN = 3    # columna C en adelante

# Mapeo de código del Excel -> valor real que usa el sistema
STATUS_MAP = {
    "A": "present",
    "F": "absent",
    "R": "late",
    "L": "leave",
}

# Excepciones manuales: cuando el nombre en el Excel no coincide exactamente
# con el nombre guardado en el sistema (typos, apellidos distintos, etc.).
# Clave: nombre tal cual aparece en el Excel ("Apellidos, Nombres").
# Valor: (apellidos, nombres) tal cual están guardados en el sistema.
ALIASES_NOMBRES = {
    "Gutierrez Rojas, Lucas Diego": ("Gutierrez Rojas", "Luca Diego"),
}


# ---------------------------------------------------------------------------

def normalizar(texto: str) -> str:
    """minúsculas, sin acentos, sin espacios extra — para comparar nombres/textos."""
    if texto is None:
        return ""
    texto = str(texto).strip().lower()
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return " ".join(texto.split())


def leer_excel(ruta_excel, sheet_name):
    """Devuelve una lista de dicts: {apellidos, nombres, asistencias: {fecha: codigo}}"""
    wb = openpyxl.load_workbook(ruta_excel, data_only=True)
    if sheet_name not in wb.sheetnames:
        sys.exit(f"No encontré la hoja '{sheet_name}' en el Excel. Hojas disponibles: {wb.sheetnames}")
    ws = wb[sheet_name]

    # Detecta las columnas de fecha automáticamente a partir de la fila de encabezado.
    columnas_fecha = []
    col = FIRST_DATE_COLUMN
    celdas_vacias_seguidas = 0
    while celdas_vacias_seguidas < 3:
        valor = ws.cell(row=DATE_HEADER_ROW, column=col).value
        if isinstance(valor, (datetime, date)):
            columnas_fecha.append((col, valor.date() if isinstance(valor, datetime) else valor))
            celdas_vacias_seguidas = 0
        else:
            celdas_vacias_seguidas += 1
        col += 1

    alumnos = []
    fila = FIRST_STUDENT_ROW
    while True:
        nombre_completo = ws.cell(row=fila, column=NAME_COLUMN).value
        if nombre_completo is None:
            vacio_siguiente = ws.cell(row=fila + 1, column=NAME_COLUMN).value
            if vacio_siguiente is None:
                break
            fila += 1
            continue

        if "," in nombre_completo:
            apellidos, nombres = [p.strip() for p in nombre_completo.split(",", 1)]
        else:
            partes = nombre_completo.strip().split()
            apellidos, nombres = " ".join(partes[:2]), " ".join(partes[2:])

        asistencias = {}
        for col, fecha in columnas_fecha:
            codigo = ws.cell(row=fila, column=col).value
            if codigo:
                asistencias[fecha] = str(codigo).strip().upper()

        if asistencias:  # ignora alumnos sin ningún dato de asistencia
            alumnos.append({
                "nombre_excel": nombre_completo,
                "apellidos": apellidos,
                "nombres": nombres,
                "asistencias": asistencias,
            })

        fila += 1

    # Solo se avisa de columnas de fecha detectadas pero completamente vacías (fechas futuras).
    fechas_con_datos = sorted({f for a in alumnos for f in a["asistencias"]})
    return alumnos, fechas_con_datos


def conectar_supabase(email, password):
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    auth_response = client.auth.sign_in_with_password({"email": email, "password": password})
    if not auth_response.session:
        sys.exit("No se pudo iniciar sesión en Supabase. Revisa el email/contraseña.")
    teacher_id = auth_response.user.id
    print(f"✔ Sesión iniciada como {email} (profile id: {teacher_id})")
    return client, teacher_id


def buscar_uno(client, tabla, columnas, filtros, descripcion):
    """Busca exactamente un registro en `tabla` que cumpla los filtros exactos dados.
    Sale del programa con un mensaje claro si no encuentra ninguno o encuentra varios."""
    q = client.table(tabla).select(columnas)
    for col, val in filtros.items():
        q = q.eq(col, val)
    resp = q.execute()
    if not resp.data:
        sys.exit(f"✗ No encontré {descripcion} en la tabla '{tabla}' con {filtros}. Revisa el nombre exacto.")
    if len(resp.data) > 1:
        sys.exit(f"✗ Encontré más de un registro para {descripcion} en '{tabla}' con {filtros}: {resp.data}. Sé más específico.")
    return resp.data[0]


def resolver_ids(client, curso_nombre, paralelo_nombre, materia_nombre, periodo_nombre):
    """Convierte nombres legibles (curso, paralelo, materia, periodo) en sus IDs reales."""
    curso = buscar_uno(client, "courses", "id, name", {"name": curso_nombre}, f"el curso '{curso_nombre}'")
    paralelo = buscar_uno(
        client, "parallels", "id, name, course_id",
        {"name": paralelo_nombre, "course_id": curso["id"]},
        f"el paralelo '{paralelo_nombre}' del curso '{curso_nombre}'",
    )
    materia = buscar_uno(client, "subjects", "id, name", {"name": materia_nombre}, f"la materia '{materia_nombre}'")

    if periodo_nombre:
        periodo = buscar_uno(client, "academic_periods", "id, name", {"name": periodo_nombre}, f"el periodo '{periodo_nombre}'")
    else:
        periodo = buscar_uno(client, "academic_periods", "id, name", {"active": True}, "el periodo académico activo")

    print(f"✔ Curso: {curso['name']} ({curso['id']})")
    print(f"✔ Paralelo: {paralelo['name']} ({paralelo['id']})")
    print(f"✔ Materia: {materia['name']} ({materia['id']})")
    print(f"✔ Periodo: {periodo['name']} ({periodo['id']})")

    return curso["id"], paralelo["id"], materia["id"], periodo["id"]


def cargar_alumnos_sistema(client, course_id, parallel_id):
    resp = (
        client.table("students")
        .select("id, first_name, last_name")
        .eq("course_id", course_id)
        .eq("parallel_id", parallel_id)
        .eq("active", True)
        .execute()
    )
    alumnos_bd = resp.data
    print(f"✔ {len(alumnos_bd)} alumnos activos encontrados en el sistema para ese curso/paralelo")
    return alumnos_bd


def emparejar_alumno(alumno_excel, alumnos_bd):
    alias = ALIASES_NOMBRES.get(alumno_excel["nombre_excel"])
    if alias:
        obj_last, obj_first = normalizar(alias[0]), normalizar(alias[1])
    else:
        obj_last = normalizar(alumno_excel["apellidos"])
        obj_first = normalizar(alumno_excel["nombres"])
    for a in alumnos_bd:
        if normalizar(a["last_name"]) == obj_last and normalizar(a["first_name"]) == obj_first:
            return a
    return None


def obtener_o_crear_sesion(client, fecha, subject_id, course_id, parallel_id, academic_period_id, teacher_id, cache, dry_run):
    if fecha in cache:
        return cache[fecha]

    resp = (
        client.table("class_sessions")
        .select("id")
        .eq("subject_id", subject_id)
        .eq("course_id", course_id)
        .eq("parallel_id", parallel_id)
        .eq("class_date", fecha.isoformat())
        .execute()
    )
    if resp.data:
        session_id = resp.data[0]["id"]
        cache[fecha] = session_id
        return session_id

    if dry_run:
        print(f"  [DRY-RUN] Crearía class_session nueva para {fecha.isoformat()}")
        cache[fecha] = f"NUEVA-SESION-{fecha.isoformat()}"
        return cache[fecha]

    insert_resp = (
        client.table("class_sessions")
        .insert({
            "subject_id": subject_id,
            "teacher_id": teacher_id,
            "course_id": course_id,
            "parallel_id": parallel_id,
            "class_date": fecha.isoformat(),
            "academic_period_id": academic_period_id,
        })
        .execute()
    )
    session_id = insert_resp.data[0]["id"]
    cache[fecha] = session_id
    print(f"  ✔ Nueva class_session creada para {fecha.isoformat()} ({session_id})")
    return session_id


def main():
    parser = argparse.ArgumentParser(description="Importa asistencia de un Excel a Supabase (versión genérica)")
    parser.add_argument("--excel", required=True, help="Ruta al archivo Excel de control de asistencia")
    parser.add_argument("--curso", required=True, help='Nombre EXACTO del curso, ej. "1RO SECUNDARIA"')
    parser.add_argument("--paralelo", required=True, help='Nombre EXACTO del paralelo, ej. "A"')
    parser.add_argument("--materia", required=True, help='Nombre EXACTO de la materia, ej. "Computación"')
    parser.add_argument("--profesor-email", required=True, help="Email del profesor que registra la asistencia")
    parser.add_argument("--hoja", default="ASIST 3º", help='Nombre de la hoja del Excel (default: "ASIST 3º")')
    parser.add_argument("--periodo", default=None, help='Nombre exacto del trimestre/periodo (default: el que está activo)')
    parser.add_argument("--dry-run", action="store_true", help="Solo simula, no escribe nada en la base de datos")
    args = parser.parse_args()

    password = os.environ.get("TEACHER_PASSWORD")
    if not password:
        sys.exit(
            "Falta la variable de entorno TEACHER_PASSWORD.\n"
            "Defínela antes de correr el script, por ejemplo:\n"
            '  export TEACHER_PASSWORD="la_contraseña_real"   (Mac/Linux)\n'
            '  $env:TEACHER_PASSWORD = "la_contraseña_real"   (Windows PowerShell)'
        )

    print(f"{'='*60}\nModo: {'DRY-RUN (simulación, no escribe nada)' if args.dry_run else 'REAL (va a escribir en la base de datos)'}\n{'='*60}")

    alumnos_excel, fechas_detectadas = leer_excel(args.excel, args.hoja)
    print(f"✔ {len(alumnos_excel)} alumnos con datos de asistencia leídos del Excel")
    print(f"✔ Fechas detectadas con datos: {', '.join(f.isoformat() for f in fechas_detectadas)}")

    client, teacher_id_login = conectar_supabase(args.profesor_email, password)
    course_id, parallel_id, subject_id, academic_period_id = resolver_ids(
        client, args.curso, args.paralelo, args.materia, args.periodo
    )
    alumnos_bd = cargar_alumnos_sistema(client, course_id, parallel_id)

    session_cache = {}
    no_encontrados = []
    total_a_insertar = []

    for alumno in alumnos_excel:
        match = emparejar_alumno(alumno, alumnos_bd)
        if not match:
            no_encontrados.append(alumno["nombre_excel"])
            continue

        for fecha, codigo in alumno["asistencias"].items():
            status = STATUS_MAP.get(codigo)
            if not status:
                print(f"  ⚠ Código desconocido '{codigo}' para {alumno['nombre_excel']} en {fecha}, se omite")
                continue

            session_id = obtener_o_crear_sesion(
                client, fecha, subject_id, course_id, parallel_id, academic_period_id, teacher_id_login,
                session_cache, args.dry_run,
            )

            registro = {
                "class_session_id": session_id,
                "student_id": match["id"],
                "status": status,
                "registered_by": teacher_id_login,
            }
            total_a_insertar.append((alumno["nombre_excel"], fecha, status, registro))

    print(f"\n{'='*60}")
    print(f"Alumnos NO encontrados en el sistema ({len(no_encontrados)}):")
    for n in no_encontrados:
        print(f"  ✗ {n}")
    print(f"\nRegistros de asistencia a procesar: {len(total_a_insertar)}")
    print(f"{'='*60}\n")

    if args.dry_run:
        for nombre, fecha, status, _ in total_a_insertar[:15]:
            print(f"  [DRY-RUN] {nombre} — {fecha.isoformat()} — {status}")
        if len(total_a_insertar) > 15:
            print(f"  ... y {len(total_a_insertar) - 15} más")
        print("\nNada se escribió en la base de datos (modo dry-run). Corre sin --dry-run para aplicar los cambios.")
        return

    total_insertados = 0
    for nombre, fecha, status, registro in total_a_insertar:
        client.table("attendance").upsert(registro, on_conflict="class_session_id,student_id").execute()
        total_insertados += 1
        print(f"  ✔ {nombre} — {fecha.isoformat()} — {status}")

    print(f"\n✅ Listo. {total_insertados} registros de asistencia guardados en Supabase.")


if __name__ == "__main__":
    main()
