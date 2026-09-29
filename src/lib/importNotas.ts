import * as XLSX from "xlsx";

// Genera una plantilla en Excel con los alumnos del curso/paralelo ya cargados
// (Código y Nombre) para que el profesor solo tenga que llenar la columna "Nota".
export function generarPlantillaNotas(alumnos, evaluacionTitulo) {
  const filas = alumnos.map((a) => ({
    Código: a.student_code || "",
    Nombre: `${a.first_name} ${a.last_name}`.trim(),
    Nota: "",
  }));

  const ws = XLSX.utils.json_to_sheet(filas);
  ws["!cols"] = [{ wch: 16 }, { wch: 30 }, { wch: 10 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Notas");
  const nombreArchivo = `Plantilla_Notas_${(evaluacionTitulo || "evaluacion").replace(/\s+/g, "_")}.xlsx`;
  XLSX.writeFile(wb, nombreArchivo);
}

// Lee un archivo con columnas "Código" y "Nota" (acepta variaciones comunes de
// mayúsculas/acentos) y devuelve las filas crudas para validar contra los
// alumnos del curso/paralelo seleccionado.
export async function leerArchivoNotas(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const buscarValor = (fila, posibles) => {
    const clave = Object.keys(fila).find((k) => posibles.includes(k.trim().toLowerCase()));
    return clave ? fila[clave] : "";
  };

  return json.map((fila, i) => ({
    fila: i + 2,
    codigo: String(buscarValor(fila, ["código", "codigo", "código rude", "codigo rude"])).trim(),
    nota: String(buscarValor(fila, ["nota", "score", "puntaje", "calificación", "calificacion"])).trim(),
  }));
}
