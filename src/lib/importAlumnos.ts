import * as XLSX from "xlsx";

const MESES_ES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };

// "6 de nov. de 2013" -> "2013-11-06". Si no se reconoce, devuelve el texto original.
export function parseFechaEs(texto) {
  if (!texto) return "";
  const m = String(texto).match(/(\d{1,2})\s+de\s+([a-záéíóú]{3,4})\.?\s+de\s+(\d{4})/i);
  if (!m) return String(texto).trim();
  const dia = m[1].padStart(2, "0");
  const mesKey = m[2].toLowerCase().slice(0, 3);
  const mes = MESES_ES[mesKey];
  if (!mes) return String(texto).trim();
  return `${m[3]}-${String(mes).padStart(2, "0")}-${dia}`;
}

// Convención boliviana observada: [Apellido paterno] [Apellido materno] [Nombre(s)]
export function separarNombreCompleto(nombreCompleto) {
  const tokens = String(nombreCompleto).trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 2) return { apellido: tokens.join(" "), nombre: "" };
  return { apellido: tokens.slice(0, 2).join(" "), nombre: tokens.slice(2).join(" ") };
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
      const { apellido, nombre } = separarNombreCompleto(c3);
      registros.push({
        fila: i + 1,
        codigo: String(row[1] ?? "").trim(),
        carnet: String(row[2] ?? "").trim(),
        nombreCompleto: c3,
        nombre,
        apellido,
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
const COLUMNAS_SIMPLE = ["Código", "Nombre", "Apellido", "Curso", "Paralelo", "Padre/Tutor", "Teléfono padre", "Madre/Tutora", "Teléfono madre"];

export function parseFormatoSimple(sheet) {
  const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (json.length === 0) return null;
  const columnas = Object.keys(json[0]);
  const faltantes = COLUMNAS_SIMPLE.filter((c) => !columnas.includes(c));
  if (faltantes.length > 0) return null;

  return json.map((r, i) => ({
    fila: i + 2,
    codigo: String(r["Código"] ?? "").trim(),
    carnet: "",
    nombre: String(r["Nombre"] ?? "").trim(),
    apellido: String(r["Apellido"] ?? "").trim(),
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
