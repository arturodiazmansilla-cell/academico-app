import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { aplicarEstiloHoja, descargarWorkbook } from "./excelEstilos";

function nombreArchivoBase(nombreCurso, nombreParalelo) {
  const partes = ["Alumnos", nombreCurso, nombreParalelo ? `Paralelo-${nombreParalelo}` : null].filter(Boolean);
  return partes.join("_").replace(/\s+/g, "_");
}

// Clasifica el campo libre "gender" en Hombre/Mujer/Sin especificar,
// aceptando "M"/"F", "Masculino"/"Femenino", etc.
function clasificarGenero(valor) {
  const v = (valor || "").trim().toUpperCase();
  if (v.startsWith("M")) return "M";
  if (v.startsWith("F")) return "F";
  return "S";
}

function contarPorGenero(alumnos) {
  const conteo = { M: 0, F: 0, S: 0 };
  alumnos.forEach((a) => { conteo[clasificarGenero(a.gender)]++; });
  return conteo;
}

// Convierte un índice de columna (1=A, 27=AA…) a letra de columna Excel.
function letraColumna(indice) {
  let n = indice, letra = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

// Exporta la lista filtrada de alumnos a un Excel (.xlsx) con título,
// cabecera azul/negra, bordes en todas las celdas, y un resumen de
// cantidades (total, hombres, mujeres) al pie de la tabla.
export async function exportarAlumnosExcel(alumnos, nombreCurso, nombreParalelo) {
  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet("Alumnos");

  const columnas = [
    { key: "nro", width: 6 },
    { key: "codigo", width: 16 },
    { key: "nombre", width: 18 },
    { key: "apellido", width: 18 },
    { key: "curso", width: 16 },
    { key: "paralelo", width: 10 },
    { key: "padre", width: 22 },
    { key: "telPadre", width: 14 },
    { key: "madre", width: 22 },
    { key: "telMadre", width: 14 },
    { key: "estado", width: 10 },
  ];
  hoja.columns = columnas;

  const ultimaCol = letraColumna(columnas.length);

  hoja.mergeCells(`A1:${ultimaCol}1`);
  hoja.getCell("A1").value = "LISTA DE ALUMNOS";
  hoja.getCell("A1").font = { bold: true, size: 14 };

  hoja.mergeCells(`A2:${ultimaCol}2`);
  hoja.getCell("A2").value = `${nombreCurso}${nombreParalelo ? ` · Paralelo ${nombreParalelo}` : ""}`;
  hoja.getCell("A2").font = { bold: true, size: 11 };

  hoja.addRow([]); // fila 3 en blanco

  const filaCabecera = 4;
  hoja.addRow(["Nro", "Código", "Nombre", "Apellido", "Curso", "Paralelo", "Padre/Tutor", "Teléfono padre", "Madre/Tutora", "Teléfono madre", "Estado"]);

  alumnos.forEach((a, i) => {
    hoja.addRow({
      nro: i + 1,
      codigo: a.student_code || "",
      nombre: a.first_name || "",
      apellido: a.last_name || "",
      curso: a.courses?.name || "",
      paralelo: a.parallels?.name || "",
      padre: a.father_name || "",
      telPadre: a.father_phone || "",
      madre: a.mother_name || "",
      telMadre: a.mother_phone || "",
      estado: a.active ? "Activo" : "Inactivo",
    });
  });

  aplicarEstiloHoja(hoja, filaCabecera);

  const conteo = contarPorGenero(alumnos);
  hoja.addRow([]); // fila en blanco antes del resumen
  const filaResumen = hoja.addRow([`Total alumnos: ${alumnos.length}`, `Hombres: ${conteo.M}`, `Mujeres: ${conteo.F}`]);
  filaResumen.font = { bold: true };

  await descargarWorkbook(workbook, `${nombreArchivoBase(nombreCurso, nombreParalelo)}.xlsx`);
}

// Exporta la lista filtrada a un PDF tamaño carta, con título, encabezado
// institucional, tabla formateada y resumen de cantidades al pie.
export function exportarAlumnosPdf(alumnos, institucionNombre, nombreCurso, nombreParalelo) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margenIzq = 40;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(institucionNombre || "Sistema Académico", margenIzq, 45);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("LISTA DE ALUMNOS", margenIzq, 64);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${nombreCurso}${nombreParalelo ? ` · Paralelo ${nombreParalelo}` : ""}`, margenIzq, 80);

  doc.setFontSize(9);
  doc.setTextColor(100);
  const fecha = new Date().toLocaleDateString("es-BO", { year: "numeric", month: "long", day: "numeric" });
  doc.text(`Generado el ${fecha}`, margenIzq, 94);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 108,
    margin: { left: margenIzq, right: margenIzq },
    head: [["Nro", "Código", "Nombre completo", "Padre/Madre o Tutor", "Teléfono", "Estado"]],
    body: alumnos.map((a, i) => [
      i + 1,
      a.student_code || "—",
      `${a.first_name} ${a.last_name}`.trim() || "—",
      a.father_name || a.mother_name || "—",
      a.father_phone || a.mother_phone || "—",
      a.active ? "Activo" : "Inactivo",
    ]),
    styles: { fontSize: 9, cellPadding: 5, lineColor: [226, 232, 240], lineWidth: 0.5 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 30, halign: "center" }, 5: { halign: "center" } },
  });

  // Resumen de cantidades al pie de la tabla.
  const conteo = contarPorGenero(alumnos);
  const finY = doc.lastAutoTable.finalY + 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Total alumnos: ${alumnos.length}     Hombres: ${conteo.M}     Mujeres: ${conteo.F}`, margenIzq, finY);

  // Numeración de página al final, cuando ya se sabe el total real de páginas.
  const totalPaginas = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Página ${i} de ${totalPaginas}`,
      pageWidth - margenIzq - 60,
      doc.internal.pageSize.getHeight() - 20
    );
  }

  doc.save(`${nombreArchivoBase(nombreCurso, nombreParalelo)}.pdf`);
}

