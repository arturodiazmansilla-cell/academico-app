import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { aplicarEstiloHoja, descargarWorkbook } from "./excelEstilos";

const ETIQUETAS = { present: "Presente", absent: "Ausente", late: "Tarde", leave: "Licencia" };
// Abreviaturas para la planilla mensual, donde cada día es una columna angosta.
const ABREVIATURAS = { present: "P", absent: "F", late: "T", leave: "L" };

function nombreArchivo(prefijo, curso, paralelo, sufijo) {
  return [prefijo, curso, paralelo ? `Paralelo-${paralelo}` : null, sufijo]
    .filter(Boolean)
    .join("_")
    .replace(/\s+/g, "_");
}

function encabezadoPdf(doc, institucion, titulo, subtitulo, extra) {
  const margen = 40;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(institucion || "Sistema Académico", margen, 45);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(titulo, margen, 66);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60);
  doc.text(subtitulo, margen, 82);

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(extra, margen, 96);
  doc.setTextColor(0);
  return 112;
}

function numerarPaginas(doc) {
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Página ${i} de ${total}`,
      doc.internal.pageSize.getWidth() - 100,
      doc.internal.pageSize.getHeight() - 20
    );
    doc.setTextColor(0);
  }
}

function resumen(conteos) {
  return `Presentes: ${conteos.present} · Ausentes: ${conteos.absent} · Tardes: ${conteos.late} · Licencias: ${conteos.leave}`;
}

function contar(valores) {
  const c = { present: 0, absent: 0, late: 0, leave: 0, sin: 0 };
  valores.forEach((v) => {
    if (v && c[v] !== undefined) c[v]++;
    else c.sin++;
  });
  return c;
}

// Convierte un índice de columna (1 = A, 2 = B, ..., 27 = AA...) a su
// letra de columna de Excel. Necesario porque la planilla mensual puede
// superar las 26 columnas (días del mes + totales).
function letraColumna(indice) {
  let n = indice;
  let letra = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

// Escribe 3 filas de título (institución, nombre del reporte, línea de
// contexto con fecha/mes) fusionadas sobre el ancho de la tabla, y devuelve
// el número de fila donde debe empezar la cabecera de columnas.
function escribirTituloExcel(hoja, totalColumnas, institucion, tituloReporte, lineaContexto) {
  const ultimaCol = letraColumna(totalColumnas);

  hoja.mergeCells(`A1:${ultimaCol}1`);
  const filaInstitucion = hoja.getCell("A1");
  filaInstitucion.value = institucion || "Sistema Académico";
  filaInstitucion.font = { bold: true, size: 14 };
  filaInstitucion.alignment = { horizontal: "left" };

  hoja.mergeCells(`A2:${ultimaCol}2`);
  const filaTitulo = hoja.getCell("A2");
  filaTitulo.value = tituloReporte;
  filaTitulo.font = { bold: true, size: 12 };

  hoja.mergeCells(`A3:${ultimaCol}3`);
  const filaContexto = hoja.getCell("A3");
  filaContexto.value = lineaContexto;
  filaContexto.font = { italic: true, size: 10, color: { argb: "FF444444" } };

  hoja.addRow([]); // fila 4 en blanco, separa el título de la tabla
  return 5; // la cabecera de columnas empieza en la fila 5
}

// ============ REPORTE DEL DÍA ============

export function exportarAsistenciaDiaPdf(ctx) {
  const { estudiantes, estados, institucion, materia, curso, paralelo, fecha } = ctx;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });

  const conteos = contar(estudiantes.map((s) => estados[s.id]));
  const fechaLegible = new Date(`${fecha}T12:00:00`).toLocaleDateString("es-BO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const startY = encabezadoPdf(
    doc,
    institucion,
    "REGISTRO DIARIO DE ASISTENCIA",
    `${curso}${paralelo ? ` · Paralelo ${paralelo}` : ""}${materia ? ` · ${materia}` : ""}`,
    `${fechaLegible} · ${estudiantes.length} estudiantes · ${resumen(conteos)}`
  );

  autoTable(doc, {
    startY,
    margin: { left: 40, right: 40 },
    head: [["Nº", "Código", "Apellidos y nombres", "Estado", "Observaciones"]],
    body: estudiantes.map((s, i) => [
      i + 1,
      s.student_code || "—",
      `${s.last_name} ${s.first_name}`.trim(),
      ETIQUETAS[estados[s.id]] || "Sin registrar",
      "",
    ]),
    styles: { fontSize: 9, cellPadding: 5, lineColor: [210, 218, 230], lineWidth: 0.5 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 28, halign: "center" },
      1: { cellWidth: 92 },
      3: { cellWidth: 74, halign: "center" },
      4: { cellWidth: 110 },
    },
    // Colorea el estado para que se lea de un vistazo en papel.
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 3) {
        const estado = estados[estudiantes[data.row.index].id];
        if (estado === "absent") data.cell.styles.textColor = [185, 28, 28];
        else if (estado === "present") data.cell.styles.textColor = [21, 128, 61];
        else if (estado === "late") data.cell.styles.textColor = [180, 83, 9];
        else if (estado === "leave") data.cell.styles.textColor = [3, 105, 161];
        else data.cell.styles.textColor = [148, 163, 184];
      }
    },
  });

  // Espacio de firma al pie del reporte.
  const finY = doc.lastAutoTable.finalY + 50;
  if (finY < doc.internal.pageSize.getHeight() - 60) {
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text("_______________________________", 40, finY);
    doc.text("Firma del docente", 40, finY + 14);
    doc.text("_______________________________", 330, finY);
    doc.text("Vº Bº Dirección", 330, finY + 14);
  }

  numerarPaginas(doc);
  doc.save(`${nombreArchivo("Asistencia", curso, paralelo, fecha)}.pdf`);
}

export async function exportarAsistenciaDiaExcel(ctx) {
  const { estudiantes, estados, institucion, materia, curso, paralelo, fecha } = ctx;

  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet("Asistencia");

  const columnas = [
    { key: "n", width: 5 },
    { key: "codigo", width: 16 },
    { key: "apellidos", width: 20 },
    { key: "nombres", width: 20 },
    { key: "curso", width: 16 },
    { key: "paralelo", width: 9 },
    { key: "materia", width: 18 },
    { key: "fecha", width: 12 },
    { key: "estado", width: 14 },
  ];
  hoja.columns = columnas;

  const fechaLegible = new Date(`${fecha}T12:00:00`).toLocaleDateString("es-BO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const filaCabecera = escribirTituloExcel(
    hoja,
    columnas.length,
    institucion,
    "REGISTRO DIARIO DE ASISTENCIA",
    `${curso}${paralelo ? ` · Paralelo ${paralelo}` : ""}${materia ? ` · ${materia}` : ""}  —  Fecha: ${fechaLegible}`
  );

  hoja.addRow(["Nº", "Código", "Apellidos", "Nombres", "Curso", "Paralelo", "Materia", "Fecha", "Estado"]);

  estudiantes.forEach((s, i) => {
    hoja.addRow({
      n: i + 1,
      codigo: s.student_code || "",
      apellidos: s.last_name || "",
      nombres: s.first_name || "",
      curso,
      paralelo: paralelo || "",
      materia: materia || "",
      fecha,
      estado: ETIQUETAS[estados[s.id]] || "Sin registrar",
    });
  });

  aplicarEstiloHoja(hoja, filaCabecera);
  await descargarWorkbook(workbook, `${nombreArchivo("Asistencia", curso, paralelo, fecha)}.xlsx`);
}

// ============ PLANILLA MENSUAL ============
// filas: [{ estudiante, porDia: { "2026-09-01": "present", ... } }]

export function exportarAsistenciaMesPdf(ctx) {
  const { estudiantes, porEstudianteYDia, dias, institucion, curso, paralelo, mesLegible } = ctx;
  // Horizontal: una planilla mensual no entra en vertical con ~22 días hábiles.
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });

  const startY = encabezadoPdf(
    doc,
    institucion,
    "PLANILLA MENSUAL DE ASISTENCIA",
    `${curso}${paralelo ? ` · Paralelo ${paralelo}` : ""}`,
    `${mesLegible} · ${estudiantes.length} estudiantes · P=Presente · F=Falta · T=Tarde · L=Licencia`
  );

  const anchoDia = Math.max(14, Math.min(20, 520 / Math.max(dias.length, 1)));

  const columnStyles = { 0: { cellWidth: 24, halign: "center" }, 1: { cellWidth: 150 } };
  dias.forEach((_, i) => {
    columnStyles[i + 2] = { cellWidth: anchoDia, halign: "center" };
  });
  columnStyles[dias.length + 2] = { cellWidth: 28, halign: "center", fontStyle: "bold" };

  autoTable(doc, {
    startY,
    margin: { left: 30, right: 30 },
    head: [[
      "Nº",
      "Apellidos y nombres",
      ...dias.map((d) => String(Number(d.slice(8, 10)))),
      "F",
    ]],
    body: estudiantes.map((s, i) => {
      const marcas = porEstudianteYDia[s.id] || {};
      const faltas = dias.filter((d) => marcas[d] === "absent").length;
      return [
        i + 1,
        `${s.last_name} ${s.first_name}`.trim(),
        ...dias.map((d) => ABREVIATURAS[marcas[d]] || ""),
        faltas,
      ];
    }),
    styles: { fontSize: 7, cellPadding: 2.5, lineColor: [210, 218, 230], lineWidth: 0.4 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles,
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index >= 2 && data.column.index < dias.length + 2) {
        const valor = data.cell.raw;
        if (valor === "F") data.cell.styles.textColor = [185, 28, 28];
        else if (valor === "T") data.cell.styles.textColor = [180, 83, 9];
        else if (valor === "L") data.cell.styles.textColor = [3, 105, 161];
        else if (valor === "P") data.cell.styles.textColor = [100, 116, 139];
      }
    },
  });

  numerarPaginas(doc);
  doc.save(`${nombreArchivo("Asistencia-Mensual", curso, paralelo, mesLegible)}.pdf`);
}

export async function exportarAsistenciaMesExcel(ctx) {
  const { estudiantes, porEstudianteYDia, dias, institucion, curso, paralelo, mesLegible } = ctx;

  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet("Asistencia mensual");

  const columnas = [
    { key: "n", width: 5 },
    { key: "codigo", width: 16 },
    { key: "nombre", width: 28 },
    ...dias.map((d) => ({ key: `d${d}`, width: 4 })),
    { key: "presentes", width: 10 },
    { key: "faltas", width: 8 },
    { key: "tardes", width: 8 },
    { key: "licencias", width: 10 },
  ];
  hoja.columns = columnas;

  const filaCabecera = escribirTituloExcel(
    hoja,
    columnas.length,
    institucion,
    "PLANILLA MENSUAL DE ASISTENCIA",
    `${curso}${paralelo ? ` · Paralelo ${paralelo}` : ""}  —  Mes: ${mesLegible}  (P=Presente, F=Falta, T=Tarde, L=Licencia)`
  );

  hoja.addRow([
    "Nº", "Código", "Apellidos y nombres",
    ...dias.map((d) => String(Number(d.slice(8, 10)))),
    "Presentes", "Faltas", "Tardes", "Licencias",
  ]);

  estudiantes.forEach((s, i) => {
    const marcas = porEstudianteYDia[s.id] || {};
    const fila = {
      n: i + 1,
      codigo: s.student_code || "",
      nombre: `${s.last_name} ${s.first_name}`.trim(),
    };
    dias.forEach((d) => { fila[`d${d}`] = ABREVIATURAS[marcas[d]] || ""; });
    const c = contar(dias.map((d) => marcas[d]));
    fila.presentes = c.present;
    fila.faltas = c.absent;
    fila.tardes = c.late;
    fila.licencias = c.leave;
    hoja.addRow(fila);
  });

  aplicarEstiloHoja(hoja, filaCabecera);
  await descargarWorkbook(workbook, `${nombreArchivo("Asistencia-Mensual", curso, paralelo, mesLegible)}.xlsx`);
}
