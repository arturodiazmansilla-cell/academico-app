import * as XLSX from "xlsx";

// Se agregó "set" y "sep": el Excel trae "14 de set. de 2009" y antes no se reconocía.
const MESES_ES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };

// "6 de nov. de 2013" -> "2013-11-06". Si no se reconoce, devuelve "" (así no rompe la columna date).
export function parseFechaEs(texto) {
  if (!texto) return "";
  const m = String(texto).match(/(\d{1,2})\s+de\s+([a-záéíóú]{3,5})\.?\s+de\s+(\d{4})/i);
  if (!m) return "";
  const dia = m[1].padStart(2, "0");
  const mes = MESES_ES[m[2].toLowerCase().slice(0, 3)];
  if (!mes) return "";
  return `${m[3]}-${String(mes).padStart(2, "0")}-${dia}`;
}

// RUDE opcional: vacío => null (no cadena vacía), para que el índice único no falle.
export function limpiarCodigo(valor) {
  const s = String(valor ?? "").replace(/\s+/g, "").trim();
  return s === "" ? null : s;
}

// Sin tildes, mayúsculas y espacios simples. Sirve para comparar duplicados.
export function normalizar(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

const PARTICULAS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "DA", "DAS", "DO", "DOS", "VAN", "VON", "SAN", "SANTA", "Y"]);

// Devuelve el índice (exclusivo) donde termina un apellido que puede empezar con partículas
// ("DE LAS MUÑECAS", "DA SILVA"). Siempre deja al menos un token libre para el nombre.
function finApellido(tokens, inicio) {
  let j = inicio;
  while (j < tokens.length - 1 && PARTICULAS.has(tokens[j].toUpperCase())) j++;
  j++; // la palabra principal del apellido
  while (j < tokens.length - 1 && PARTICULAS.has(tokens[j].toUpperCase())) {
    j++;
    if (j < tokens.length - 1) j++;
  }
  return Math.min(j, tokens.length - 1);
}

// Convención: [Apellido paterno] [Apellido materno] [Nombre(s)].
// En el Excel oficial, cuando hay paterno y materno vienen separados por DOBLE espacio
// ("AGUILAR  LECLERE THAIS"); eso se usa para saber dónde termina el paterno.
// `revisar` = true cuando la separación es una suposición y conviene mirarla en la vista previa.
export function separarNombreCompleto(nombreCompleto) {
  const limpio = String(nombreCompleto).trim();
  const tokens = limpio.split(/\s+/).filter(Boolean);
  if (tokens.length <= 2) return { apellido: tokens.join(" "), nombre: "", revisar: true };

  const bloques = limpio.split(/\s{2,}/);
  if (bloques.length >= 2) {
    const paterno = bloques[0].split(/\s+/).filter(Boolean);
    const resto = bloques.slice(1).join(" ").split(/\s+/).filter(Boolean);
    if (resto.length >= 2) {
      const finMaterno = finApellido(resto, 0);
      return {
        apellido: [...paterno, ...resto.slice(0, finMaterno)].join(" "),
        nombre: resto.slice(finMaterno).join(" "),
        revisar: false,
      };
    }
  }

  // Sin doble espacio: se asume paterno + materno, pero puede ser un solo apellido.
  const finPaterno = finApellido(tokens, 0);
  const fin = finApellido(tokens, finPaterno);
  return { apellido: tokens.slice(0, fin).join(" "), nombre: tokens.slice(fin).join(" "), revisar: true };
}

// Formato oficial: bloques repetidos por curso/paralelo con cabecera
// "No | Código Rude | Carnet | Nombre Completo | Género | Fecha Nacimiento |
//  Lugar Nacimiento (2 col) | MADRE | NÚMERO | PADRE | NÚMERO".
export function parseFormatoInstitucional(sheet) {
  const filas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  let cursoActual = "";
  let paraleloActual = "";
  const registros = [];

  filas.forEach((row, i) => {
    const c0 = String(row[0] ?? "").trim();
    const c3 = String(row[3] ?? "").trim();
    if (!c0 && !c3) return;

    if (/^paralelo/i.test(c0)) {
      const m = c0.match(/:\s*(.+)$/);
      paraleloActual = (m ? m[1] : c0.replace(/paralelo/i, "")).trim();
      return;
    }
    if (c0.toLowerCase() === "no" && c3.toLowerCase().includes("nombre")) return;
    if (/mujeres/i.test(c3) || /varones/i.test(c3)) return;

    const esFilaDeAlumno = /^\d+$/.test(c0) && c3.length > 0;
    if (esFilaDeAlumno) {
      const { apellido, nombre, revisar } = separarNombreCompleto(c3);
      registros.push({
        fila: i + 1,
        codigo: limpiarCodigo(row[1]),
        carnet: String(row[2] ?? "").trim(),
        nombreCompleto: c3,
        nombre,
        apellido,
        revisarNombre: revisar,
        genero: String(row[4] ?? "").trim(),
        fecha: parseFechaEs(row[5]),
        lugarNacimiento: [row[6], row[7]].map((v) => String(v ?? "").trim()).filter(Boolean).join(", "),
        madre: String(row[8] ?? "").trim(),
        telMadre: String(row[9] ?? "").trim(),
        padre: String(row[10] ?? "").trim(),
        telPadre: String(row[11] ?? "").trim(),
        curso: cursoActual,
        paralelo: paraleloActual,
      });
      return;
    }

    if (c0 && !c3) cursoActual = c0;
  });

  return registros;
}

// Respaldo: una sola tabla con columnas planas
// Código, Nombre, Apellido, Curso, Paralelo, Padre/Tutor, Teléfono padre, Madre/Tutora, Teléfono madre
// (ya no se exige que la columna Código tenga valor; puede ir vacía)
const COLUMNAS_SIMPLE = ["Código", "Nombre", "Apellido", "Curso", "Paralelo", "Padre/Tutor", "Teléfono padre", "Madre/Tutora", "Teléfono madre"];

export function parseFormatoSimple(sheet) {
  const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (json.length === 0) return null;
  const columnas = Object.keys(json[0]);
  const faltantes = COLUMNAS_SIMPLE.filter((c) => !columnas.includes(c));
  if (faltantes.length > 0) return null;

  return json.map((r, i) => ({
    fila: i + 2,
    codigo: limpiarCodigo(r["Código"]),
    carnet: "",
    nombre: String(r["Nombre"] ?? "").trim(),
    apellido: String(r["Apellido"] ?? "").trim(),
    revisarNombre: false,
    genero: "",
    fecha: "",
    lugarNacimiento: "",
    curso: String(r["Curso"] ?? "").trim(),
    paralelo: String(r["Paralelo"] ?? "").trim(),
    padre: String(r["Padre/Tutor"] ?? "").trim(),
    telPadre: String(r["Teléfono padre"] ?? "").trim(),
    madre: String(r["Madre/Tutora"] ?? "").trim(),
    telMadre: String(r["Teléfono madre"] ?? "").trim(),
  }));
}

// Lee el archivo y devuelve { registros, formato } probando primero el formato
// oficial y usando el formato simple como respaldo.
export async function leerArchivoAlumnos(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  let registros = parseFormatoInstitucional(sheet);
  let formato = "institucional";
  if (registros.length === 0) {
    const simple = parseFormatoSimple(sheet);
    if (simple) {
      registros = simple;
      formato = "simple";
    }
  }
  return { registros, formato };
}

// ---------------------------------------------------------------------------
// Validación: el RUDE NO es obligatorio; curso, paralelo, nombre y apellido sí.
// ---------------------------------------------------------------------------
export function validarRegistro(r) {
  const errores = [];
  if (!r.apellido) errores.push("Falta apellido");
  if (!r.nombre) errores.push("Falta nombre");
  if (!r.curso) errores.push("Falta curso");
  if (!r.paralelo) errores.push("Falta paralelo");
  return errores;
}

// ---------------------------------------------------------------------------
// Duplicados.
// `existentes` = alumnos que ya están en la BD, con la misma forma que los registros:
//   { codigo, nombre, apellido, curso, paralelo }   (curso/paralelo como TEXTO, no id)
// Reglas:
//  - Con RUDE: duplicado si el RUDE ya existe.
//  - Sin RUDE: duplicado si coincide nombre + apellido + curso + paralelo.
//  - RUDE repetido pero con OTRO nombre => no se omite: se importa con codigo = null
//    y se avisa en `advertencias` (suele ser un RUDE copiado por error en el Excel).
// ---------------------------------------------------------------------------
const clavePersona = (r) => `${normalizar(r.apellido)}|${normalizar(r.nombre)}|${normalizar(r.curso)}|${normalizar(r.paralelo)}`;

export function separarDuplicados(registros, existentes = []) {
  const rudeConocido = new Map(); // rude -> clave de persona
  const personasConocidas = new Set();
  for (const e of existentes) {
    if (e.codigo) rudeConocido.set(String(e.codigo).trim(), clavePersona(e));
    personasConocidas.add(clavePersona(e));
  }

  const nuevos = [];
  const omitidos = [];
  const advertencias = [];

  for (const r of registros) {
    const persona = clavePersona(r);

    if (personasConocidas.has(persona)) {
      omitidos.push({ ...r, motivo: "Ya existe (mismo nombre, curso y paralelo)" });
      continue;
    }

    let fila = r;
    if (r.codigo && rudeConocido.has(r.codigo)) {
      if (rudeConocido.get(r.codigo) === persona) {
        omitidos.push({ ...r, motivo: "Ya existe (mismo RUDE)" });
        continue;
      }
      fila = { ...r, codigo: null };
      advertencias.push({ ...r, motivo: `RUDE ${r.codigo} repetido con otro alumno; se importó sin RUDE` });
    }

    if (fila.codigo) rudeConocido.set(fila.codigo, persona);
    personasConocidas.add(persona);
    nuevos.push(fila);
  }

  return { nuevos, omitidos, advertencias };
}
