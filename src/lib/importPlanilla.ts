import * as XLSX from "xlsx";

const norm = (v) => String(v ?? "").trim();

// Quita tildes y normaliza espacios para poder comparar nombres de forma robusta.
export function normalizarNombre(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Hojas de tipo "REG1erTRIM", "REG2doTRIM", "REG3erTRIM" (el nombre puede variar
// ligeramente entre colegios, por eso se busca con una expresión flexible).
export function detectarHojasTrimestre(workbook) {
  return workbook.SheetNames.filter((n) => /^reg\s*\d.*trim/i.test(n.replace(/\s+/g, "")));
}

// Lee la hoja de un curso/paralelo/materia completa: detecta cuántos criterios
// tiene cada dimensión (SER/SABER/HACER) -- la cantidad es variable, no fija --
// y extrae las notas de cada alumno para cada criterio encontrado.
export function parsearPlanillaCompleta(sheet) {
  const filas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  const row1 = filas[0] || [];
  const row3 = filas[2] || [];
  const row7 = filas[6] || [];
  const row8 = filas[7] || [];
  const row9 = filas[8] || [];

  let serStart = -1, saberStart = -1, hacerStart = -1, totalCol = -1, autoevalCol = -1;
  row8.forEach((v, i) => {
    const t = norm(v).toLowerCase();
    if (t.startsWith("ser")) serStart = i;
    else if (t.startsWith("saber")) saberStart = i;
    else if (t.startsWith("hacer")) hacerStart = i;
    else if (t === "total") totalCol = i;
  });
  row7.forEach((v, i) => {
    if (norm(v).toLowerCase().includes("autoev")) autoevalCol = i;
  });

  if (serStart === -1 || saberStart === -1 || hacerStart === -1 || totalCol === -1) {
    return null; // no se reconoce el formato de esta hoja
  }

  const construirCriterios = (inicio, finExclusivo) => {
    const cols = [];
    for (let c = inicio; c < finExclusivo; c++) {
      const titulo = norm(row9[c]);
      if (titulo && titulo.toLowerCase() !== "promedio") cols.push({ col: c, titulo });
    }
    return cols;
  };

  const criterios = {
    ser: construirCriterios(serStart, saberStart - 1),
    saber: construirCriterios(saberStart, hacerStart - 1),
    hacer: construirCriterios(hacerStart, totalCol - 1),
  };

  // Datos informativos (curso/materia detectados en el archivo, solo para
  // que el profesor pueda verificar que coincide con lo que seleccionó).
  let cursoDetectado = "";
  row1.forEach((v, i) => {
    if (norm(v).toUpperCase().includes("AÑO DE ESCOLARIDAD")) {
      const curso = norm(row1[i + 7]) || norm(row1[i + 1]);
      const paralelo = norm(row1[i + 9]) || "";
      cursoDetectado = `${curso} ${paralelo}`.trim();
    }
  });
  let areaDetectada = "";
  row3.forEach((v, i) => { if (norm(v).toUpperCase() === "ÁREA:") areaDetectada = norm(row3[i + 5]) || norm(row3[i + 1]); });

  // Fila de cabecera de la tabla de alumnos ("No." / "APELLIDOS Y NOMBRES")
  let headerRowIdx = filas.findIndex((r) => /^no\.?$/i.test(norm(r[0])));
  const inicioAlumnos = headerRowIdx >= 0 ? headerRowIdx + 1 : 9;

  const leerValor = (row, col) => {
    if (col < 0) return null;
    const v = row[col];
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };

  const alumnos = [];
  for (let i = inicioAlumnos; i < filas.length; i++) {
    const row = filas[i];
    const no = row[0];
    const nombreCompleto = norm(row[1]);
    const esFilaDeAlumno = nombreCompleto && (typeof no === "number" || /^\d+$/.test(norm(no)));
    if (!esFilaDeAlumno) continue;

    const [apellido, nombre] = nombreCompleto.split(",").map((s) => norm(s));

    alumnos.push({
      fila: i + 1,
      nombreCompleto,
      apellido: apellido || nombreCompleto,
      nombre: nombre || "",
      valores: {
        ser: criterios.ser.map((c) => leerValor(row, c.col)),
        saber: criterios.saber.map((c) => leerValor(row, c.col)),
        hacer: criterios.hacer.map((c) => leerValor(row, c.col)),
        autoeval: leerValor(row, autoevalCol),
      },
    });
  }

  return { areaDetectada, cursoDetectado, criterios, alumnos };
}

export async function leerLibroPlanilla(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const hojas = detectarHojasTrimestre(workbook);
  return { workbook, hojas };
}
