// Reporte de Calificación (registro de calificaciones por curso, paralelo, materia y trimestre).
// Salidas: PDF o Excel, tamaño Carta u Oficio, siempre en horizontal.
// Requiere:  npm install jspdf exceljs
//
// `datos` tiene esta forma (lo arma Notas.tsx con los mismos cálculos de la pantalla):
// {
//   anio: "1RO SECUNDARIA A", materia, trimestre, maestro, institucion?,
//   dimensiones: [{ label: "SER", max: 10, evaluaciones: [{ title, fecha: "2026-03-23" }] }, ...],
//   filas: [{ nombre, dims: [{ notas: [18, null], prom: 18 }, ...], autoev, proyecto, total, calif, cual }],
// }

export const NOMBRE_ARCHIVO = "Reporte de Calificación";

// Oficio (Bolivia): 216 x 330 mm. En Excel el tamaño más cercano es Legal (paperSize 5).
export const PAPELES = {
  carta: { nombre: "Carta", ancho: 279.4, alto: 215.9, excel: 1 },
  oficio: { nombre: "Oficio", ancho: 330, alto: 216, excel: 5 },
};

const MM = 0.3528; // 1 punto tipográfico en milímetros
const MARGEN = 8;
const Y_TABLA = MARGEN + 15 + 11 + 2.5; // debajo del título y del bloque de información
const ALTO_ENC = 62; // alto del encabezado de la tabla (6 + 5 + 51) — ampliado para que quepan títulos largos sin cortar
const NOTA_MINIMA = 51; // por debajo de esto la calificación trimestral se muestra en rojo

const COLOR = {
  grupo: [217, 217, 217],
  dimension: [230, 230, 230],
  promedio: [238, 238, 238],
  totalEnc: [252, 213, 180],
  autoEnc: [255, 242, 204],
  califEnc: [198, 224, 180],
  totalCuerpo: [254, 236, 222],
  autoCuerpo: [255, 249, 230],
  califCuerpo: [226, 239, 218],
  zebra: [248, 248, 248],
  blanco: [255, 255, 255],
  rojo: [200, 0, 0],
  negro: [0, 0, 0],
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const hayValor = (v) => v !== null && v !== undefined && v !== "";
const num = (v) => (hayValor(v) ? Number(v) : null);

export function fechaCorta(iso) {
  // "2026-03-23" -> "23/3/26"
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso || "");
  return `${Number(m[3])}/${Number(m[2])}/${m[1].slice(2)}`;
}

export function aTitulo(texto) {
  // "AGUILAR FERREL, FERNANDO DANILO" -> "Aguilar Ferrel, Fernando Danilo"
  return String(texto || "")
    .toLowerCase()
    .replace(/(^|[\s,])([a-záéíóúñü])/g, (_, sep, letra) => sep + letra.toUpperCase());
}

const puntosMaestro = (datos) => datos.dimensiones.reduce((acc, d) => acc + Number(d.max), 0);

// ---------------------------------------------------------------------------
// Columnas (compartidas por PDF y Excel)
// ---------------------------------------------------------------------------
export function listarColumnas(datos) {
  const cols = [{ tipo: "no" }, { tipo: "nombre" }];
  datos.dimensiones.forEach((d, di) => {
    d.evaluaciones.forEach((e, ei) => cols.push({ tipo: "eval", dim: di, idx: ei, evaluacion: e }));
    cols.push({ tipo: "prom", dim: di });
  });
  cols.push({ tipo: "total" }, { tipo: "autoev" }, { tipo: "proy" }, { tipo: "calif" }, { tipo: "cual" });
  return cols;
}

function armarColumnasPDF(datos, anchoUtil) {
  const cols = listarColumnas(datos);
  const fijo = { no: 7, nombre: 50, prom: 10, total: 10, autoev: 10, proy: 10, calif: 13, cual: 26 };
  cols.forEach((c) => { c.ancho = fijo[c.tipo] || 0; });

  const nEval = cols.filter((c) => c.tipo === "eval").length;
  const sumaFija = cols.reduce((a, c) => a + c.ancho, 0);
  if (nEval > 0) {
    const anchoEval = Math.min(26, Math.max(6, (anchoUtil - sumaFija) / nEval));
    cols.forEach((c) => { if (c.tipo === "eval") c.ancho = anchoEval; });
  }

  let total = cols.reduce((a, c) => a + c.ancho, 0);
  if (total < anchoUtil) {
    // Sobra espacio: se le da al nombre (hasta +25 mm).
    const extra = Math.min(anchoUtil - total, 25);
    cols.find((c) => c.tipo === "nombre").ancho += extra;
    total += extra;
  } else if (total > anchoUtil) {
    // Demasiadas actividades: se reduce todo proporcionalmente para que quepa en la hoja.
    const escala = anchoUtil / total;
    cols.forEach((c) => { c.ancho *= escala; });
    total = anchoUtil;
  }

  let x = 0;
  cols.forEach((c) => { c.x = x; x += c.ancho; });
  return { cols, total };
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
function recortar(doc, texto, maxAncho) {
  let t = String(texto);
  if (doc.getTextWidth(t) <= maxAncho) return t;
  while (t.length > 1 && doc.getTextWidth(t + "...") > maxAncho) t = t.slice(0, -1);
  return t + "...";
}

function celda(doc, x, y, w, h, relleno) {
  doc.setFillColor(...(relleno || COLOR.blanco));
  doc.rect(x, y, w, h, "FD");
}

// Texto centrado dentro de una celda; reduce la letra si no cabe.
function textoCentro(doc, texto, x, y, w, h, pt, negrita = false, color = COLOR.negro) {
  if (!hayValor(texto)) return;
  let size = pt;
  doc.setFont("helvetica", negrita ? "bold" : "normal");
  doc.setFontSize(size);
  while (size > 4.5 && doc.getTextWidth(String(texto)) > w - 0.8) {
    size -= 0.5;
    doc.setFontSize(size);
  }
  doc.setTextColor(...color);
  doc.text(String(texto), x + w / 2, y + h / 2 + size * 0.1235, { align: "center" });
}

// Texto vertical (de abajo hacia arriba), centrado en el ancho de la celda.
function textoVertical(doc, texto, x, y, w, h, pt, negrita = false) {
  doc.setFont("helvetica", negrita ? "bold" : "normal");
  doc.setFontSize(pt);
  doc.setTextColor(...COLOR.negro);
  const altoUtil = h - 2.5;
  const alturaLinea = pt * MM * 1.2;
  const maxLineas = Math.max(1, Math.floor((w - 0.4) / alturaLinea));
  let lineas = doc.splitTextToSize(String(texto), altoUtil);
  if (lineas.length > maxLineas) {
    lineas = lineas.slice(0, maxLineas);
    lineas[maxLineas - 1] = recortar(doc, lineas[maxLineas - 1] + "  ", altoUtil - 3);
  }
  const bloque = lineas.length * alturaLinea;
  const x0 = x + w / 2 - bloque / 2 + alturaLinea * 0.8;
  lineas.forEach((linea, i) => {
    doc.text(linea, x0 + i * alturaLinea, y + h - 1.4, { angle: 90 });
  });
}

function cajaInfo(doc, x, y, w, h, etiqueta, valor) {
  celda(doc, x, y, w, h, COLOR.blanco);
  const base = y + h / 2 + 8 * 0.1235;
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLOR.negro);
  doc.text(etiqueta, x + 1.5, base);
  const ancho = doc.getTextWidth(etiqueta);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(recortar(doc, valor || "", w - ancho - 6), x + 1.5 + ancho + 2.5, base);
}

function dibujarEncabezado(doc, datos, tabla, x0, ancho, logo) {
  const pw = doc.internal.pageSize.getWidth();

  // Bloque superior: logo, título e información del curso.
  let xTitulo = pw / 2;
  if (logo) {
    const alto = 15;
    const anchoLogo = Math.min(22, alto * (logo.w / logo.h));
    try { doc.addImage(logo.dataUrl, logo.formato, x0, MARGEN, anchoLogo, alto); } catch (e) { /* sin logo */ }
  }
  doc.setTextColor(...COLOR.negro);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("REGISTRO DE CALIFICACIONES", xTitulo, MARGEN + 7, { align: "center" });
  if (datos.institucion) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(String(datos.institucion), xTitulo, MARGEN + 12, { align: "center" });
  }

  const yInfo = MARGEN + 15;
  const hInfo = 5.5;
  const mitad = ancho / 2;
  cajaInfo(doc, x0, yInfo, mitad, hInfo, "AÑO DE ESCOLARIDAD:", datos.anio);
  cajaInfo(doc, x0 + mitad, yInfo, mitad, hInfo, "MATERIA:", datos.materia);
  cajaInfo(doc, x0, yInfo + hInfo, mitad, hInfo, "TRIMESTRE:", datos.trimestre);
  cajaInfo(doc, x0 + mitad, yInfo + hInfo, mitad, hInfo, "MAESTRA/O:", datos.maestro);

  // Encabezado de la tabla.
  const y0 = Y_TABLA;
  const h1 = 6, h2 = 5, h3 = ALTO_ENC - 11;
  const H = h1 + h2 + h3;
  const { cols } = tabla;

  cols.forEach((c) => {
    const x = x0 + c.x;
    if (c.tipo === "no") {
      celda(doc, x, y0, c.ancho, H, COLOR.blanco);
      textoVertical(doc, "No.", x, y0, c.ancho, H, 7, true);
    } else if (c.tipo === "nombre") {
      celda(doc, x, y0, c.ancho, H, COLOR.blanco);
      textoCentro(doc, "APELLIDOS Y NOMBRES", x, y0 + H - 9, c.ancho, 9, 8, true);
    } else if (c.tipo === "eval") {
      celda(doc, x, y0 + h1 + h2, c.ancho, h3, COLOR.blanco);
      const e = c.evaluacion;
      textoVertical(doc, `${fechaCorta(e.fecha)} ${e.title}`, x, y0 + h1 + h2, c.ancho, h3, 6, false);
    } else if (c.tipo === "prom") {
      celda(doc, x, y0 + h1 + h2, c.ancho, h3, COLOR.promedio);
      textoVertical(doc, "PROMEDIO", x, y0 + h1 + h2, c.ancho, h3, 7, true);
    } else {
      const enc = {
        total: ["TOTAL", COLOR.totalEnc],
        autoev: ["AUTOEV. DEL ESTUDIANTE / 5", COLOR.autoEnc],
        proy: ["PROYECTO / 5", COLOR.autoEnc],
        calif: ["CALIFICACIÓN TRIMESTRAL", COLOR.califEnc],
        cual: ["CUALITATIVO", COLOR.califEnc],
      }[c.tipo];
      celda(doc, x, y0, c.ancho, H, enc[1]);
      textoVertical(doc, enc[0], x, y0, c.ancho, H, 7, true);
    }
  });

  // Fila de grupo y fila de dimensiones.
  const primerDim = cols.find((c) => c.tipo === "eval" || c.tipo === "prom");
  const ultimoDim = [...cols].reverse().find((c) => c.tipo === "eval" || c.tipo === "prom");
  const xGrupo = x0 + primerDim.x;
  const wGrupo = ultimoDim.x + ultimoDim.ancho - primerDim.x;
  celda(doc, xGrupo, y0, wGrupo, h1, COLOR.grupo);
  textoCentro(doc, `EVALUACIÓN DEL MAESTRO AL ESTUDIANTE (${puntosMaestro(datos)} PUNTOS)`, xGrupo, y0, wGrupo, h1, 7.5, true);

  datos.dimensiones.forEach((d, di) => {
    const propias = cols.filter((c) => c.dim === di);
    const xd = x0 + propias[0].x;
    const wd = propias[propias.length - 1].x + propias[propias.length - 1].ancho - propias[0].x;
    celda(doc, xd, y0 + h1, wd, h2, COLOR.dimension);
    textoCentro(doc, `${d.label} / ${d.max}`, xd, y0 + h1, wd, h2, 7.5, true);
  });

  return y0 + H;
}

function dibujarFilas(doc, datos, tabla, x0, yInicio, filas, desde, hFila, pt) {
  const { cols } = tabla;
  filas.forEach((f, i) => {
    const y = yInicio + i * hFila;
    const par = (desde + i) % 2 === 1;
    cols.forEach((c) => {
      const x = x0 + c.x;
      let relleno = par ? COLOR.zebra : COLOR.blanco;
      let valor = "";
      let negrita = false;
      let color = COLOR.negro;
      let alinear = "centro";

      if (c.tipo === "no") valor = desde + i + 1;
      else if (c.tipo === "nombre") { valor = aTitulo(f.nombre); alinear = "izq"; }
      else if (c.tipo === "eval") valor = num(f.dims[c.dim]?.notas?.[c.idx]);
      else if (c.tipo === "prom") { valor = num(f.dims[c.dim]?.prom); negrita = true; relleno = COLOR.promedio; }
      else if (c.tipo === "total") { valor = num(f.total); negrita = true; relleno = COLOR.totalCuerpo; }
      else if (c.tipo === "autoev") { valor = num(f.autoev); relleno = COLOR.autoCuerpo; }
      else if (c.tipo === "proy") { valor = num(f.proyecto); relleno = COLOR.autoCuerpo; }
      else if (c.tipo === "calif") {
        valor = num(f.calif); negrita = true; relleno = COLOR.califCuerpo;
        if (valor !== null && valor < NOTA_MINIMA) color = COLOR.rojo;
      } else if (c.tipo === "cual") { valor = f.cual || ""; relleno = COLOR.califCuerpo; }

      celda(doc, x, y, c.ancho, hFila, relleno);
      if (alinear === "izq") {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(pt);
        doc.setTextColor(...color);
        doc.text(recortar(doc, valor, c.ancho - 2), x + 1.2, y + hFila / 2 + pt * 0.1235);
      } else {
        textoCentro(doc, valor, x, y, c.ancho, hFila, pt, negrita, color);
      }
    });
  });
}

// Dibuja todo el reporte sobre un documento jsPDF (o compatible). Se separa de la descarga
// para poder probarlo sin navegador.
export function dibujarReportePDF(doc, datos, logo = null) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const anchoUtil = pw - MARGEN * 2;
  const tabla = armarColumnasPDF(datos, anchoUtil);
  const x0 = MARGEN + (anchoUtil - tabla.total) / 2;

  doc.setLineWidth(0.15);
  doc.setDrawColor(70, 70, 70);

  const filas = datos.filas || [];
  const RESERVA_PIE = 16;

  // Se mide el encabezado una vez para saber cuánto alto queda para las filas.
  const yCuerpo = Y_TABLA + ALTO_ENC;
  const altoDisp = ph - MARGEN - RESERVA_PIE - yCuerpo;

  let porPagina;
  let hFila;
  if (filas.length * 3.9 <= altoDisp) {
    porPagina = Math.max(filas.length, 1);
    hFila = Math.min(6.2, altoDisp / porPagina);
  } else {
    const maxPorPagina = Math.floor(altoDisp / 4.6);
    const paginas = Math.ceil(filas.length / maxPorPagina);
    porPagina = Math.ceil(filas.length / paginas);
    hFila = Math.min(6.2, altoDisp / porPagina);
  }
  const pt = hFila >= 5.6 ? 8 : hFila >= 4.6 ? 7.5 : 6.8;

  const totalPaginas = Math.max(1, Math.ceil(filas.length / porPagina));
  for (let p = 0; p < totalPaginas; p++) {
    if (p > 0) doc.addPage();
    const yFilas = dibujarEncabezado(doc, datos, tabla, x0, tabla.total, logo);
    const desde = p * porPagina;
    dibujarFilas(doc, datos, tabla, x0, yFilas, filas.slice(desde, desde + porPagina), desde, hFila, pt);
  }

  // Pie de página en todas las hojas; firmas solo en la última.
  const paginasDoc = doc.internal.getNumberOfPages();
  const hoy = new Date();
  const fecha = `${String(hoy.getDate()).padStart(2, "0")}/${String(hoy.getMonth() + 1).padStart(2, "0")}/${hoy.getFullYear()}`;
  for (let p = 1; p <= paginasDoc; p++) {
    doc.setPage(p);
    doc.setTextColor(...COLOR.negro);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(`Impreso el ${fecha}`, x0, ph - MARGEN + 2);
    doc.text(`Página ${p} de ${paginasDoc}`, x0 + tabla.total, ph - MARGEN + 2, { align: "right" });

    if (p === paginasDoc) {
      const yFirma = ph - MARGEN - 6;
      const largo = 60;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.25);
      doc.line(x0 + 15, yFirma, x0 + 15 + largo, yFirma);
      doc.line(x0 + tabla.total - 15 - largo, yFirma, x0 + tabla.total - 15, yFirma);
      doc.setFontSize(7);
      doc.text("MAESTRO DE ÁREA", x0 + 15 + largo / 2, yFirma + 3.5, { align: "center" });
      doc.text("DIRECTORA DE UNIDAD EDUCATIVA", x0 + tabla.total - 15 - largo / 2, yFirma + 3.5, { align: "center" });
    }
  }
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------
const argb = (rgb) => "FF" + rgb.map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase();
const relleno = (rgb) => ({ type: "pattern", pattern: "solid", fgColor: { argb: argb(rgb) } });
const borde = {
  top: { style: "thin", color: { argb: "FF555555" } },
  left: { style: "thin", color: { argb: "FF555555" } },
  bottom: { style: "thin", color: { argb: "FF555555" } },
  right: { style: "thin", color: { argb: "FF555555" } },
};

export async function construirExcel(ExcelJS, datos, papel, logo = null) {
  const wb = new ExcelJS.Workbook();
  wb.creator = datos.maestro || "Sistema Académico";
  const ws = wb.addWorksheet("Calificaciones");

  const cols = listarColumnas(datos);
  const nCols = cols.length;
  // Excel considera dañado un archivo con una "combinación" de una sola celda: se evita.
  const unir = (r1, c1, r2, c2) => { if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2); };
  const FILA_TITULO = 1;
  const FILA_INFO1 = 2;
  const FILA_INFO2 = 3;
  const FILA_ENC = 5; // grupo (5), dimensiones (6), actividades (7)
  const FILA_ENC_FIN = 7;
  const FILA_CUERPO = 8;

  // Anchos (en caracteres de Excel).
  const anchos = { no: 4.5, nombre: 38, eval: 11, prom: 9, total: 8, autoev: 8, proy: 8, calif: 11, cual: 16 };
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = anchos[c.tipo]; });

  // Título e información.
  unir(FILA_TITULO, 1, FILA_TITULO, nCols);
  const titulo = ws.getCell(FILA_TITULO, 1);
  titulo.value = "REGISTRO DE CALIFICACIONES";
  titulo.font = { bold: true, size: 16 };
  titulo.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(FILA_TITULO).height = 28;

  const mitad = Math.floor(nCols / 2);
  const info = (fila, c1, c2, etiqueta, valor) => {
    unir(fila, c1, fila, c2);
    const cel = ws.getCell(fila, c1);
    cel.value = { richText: [{ text: etiqueta, font: { bold: true, size: 9 } }, { text: valor || "", font: { size: 10 } }] };
    cel.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    for (let c = c1; c <= c2; c++) ws.getCell(fila, c).border = borde;
  };
  info(FILA_INFO1, 1, mitad, "AÑO DE ESCOLARIDAD: ", datos.anio);
  info(FILA_INFO1, mitad + 1, nCols, "MATERIA: ", datos.materia);
  info(FILA_INFO2, 1, mitad, "TRIMESTRE: ", datos.trimestre);
  info(FILA_INFO2, mitad + 1, nCols, "MAESTRA/O: ", datos.maestro);

  // Encabezado: celdas de una sola columna que abarcan las 3 filas.
  const estiloEnc = (cel, fondo, rotar, tam = 9) => {
    cel.font = { bold: true, size: tam };
    cel.fill = relleno(fondo);
    cel.border = borde;
    cel.alignment = { horizontal: "center", vertical: rotar ? "bottom" : "middle", wrapText: true, textRotation: rotar ? 90 : 0 };
  };
  const combinarEnc = (col, texto, fondo, rotar) => {
    unir(FILA_ENC, col, FILA_ENC_FIN, col);
    const cel = ws.getCell(FILA_ENC, col);
    cel.value = texto;
    estiloEnc(cel, fondo, rotar);
    for (let f = FILA_ENC; f <= FILA_ENC_FIN; f++) ws.getCell(f, col).border = borde;
  };

  cols.forEach((c, i) => {
    const col = i + 1;
    if (c.tipo === "no") combinarEnc(col, "No.", COLOR.blanco, false);
    else if (c.tipo === "nombre") combinarEnc(col, "APELLIDOS Y NOMBRES", COLOR.blanco, false);
    else if (c.tipo === "total") combinarEnc(col, "TOTAL", COLOR.totalEnc, true);
    else if (c.tipo === "autoev") combinarEnc(col, "AUTOEV. DEL ESTUDIANTE / 5", COLOR.autoEnc, true);
    else if (c.tipo === "proy") combinarEnc(col, "PROYECTO / 5", COLOR.autoEnc, true);
    else if (c.tipo === "calif") combinarEnc(col, "CALIFICACIÓN TRIMESTRAL", COLOR.califEnc, true);
    else if (c.tipo === "cual") combinarEnc(col, "CUALITATIVO", COLOR.califEnc, true);
    else if (c.tipo === "eval") {
      const cel = ws.getCell(FILA_ENC_FIN, col);
      cel.value = `${fechaCorta(c.evaluacion.fecha)} ${c.evaluacion.title}`;
      estiloEnc(cel, COLOR.blanco, true, 7);
    } else if (c.tipo === "prom") {
      const cel = ws.getCell(FILA_ENC_FIN, col);
      cel.value = "PROMEDIO";
      estiloEnc(cel, COLOR.promedio, true, 9);
    }
  });

  // Grupo general y dimensiones.
  const idxDim = cols.map((c, i) => (c.tipo === "eval" || c.tipo === "prom" ? i + 1 : null)).filter(Boolean);
  unir(FILA_ENC, idxDim[0], FILA_ENC, idxDim[idxDim.length - 1]);
  const grupo = ws.getCell(FILA_ENC, idxDim[0]);
  grupo.value = `EVALUACIÓN DEL MAESTRO AL ESTUDIANTE (${puntosMaestro(datos)} PUNTOS)`;
  estiloEnc(grupo, COLOR.grupo, false);
  idxDim.forEach((c) => { ws.getCell(FILA_ENC, c).border = borde; });

  datos.dimensiones.forEach((d, di) => {
    const propias = cols.map((c, i) => (c.dim === di ? i + 1 : null)).filter(Boolean);
    unir(FILA_ENC + 1, propias[0], FILA_ENC + 1, propias[propias.length - 1]);
    const cel = ws.getCell(FILA_ENC + 1, propias[0]);
    cel.value = `${d.label} / ${d.max}`;
    estiloEnc(cel, COLOR.dimension, false);
    propias.forEach((c) => { ws.getCell(FILA_ENC + 1, c).border = borde; });
  });

  ws.getRow(FILA_ENC).height = 20;
  ws.getRow(FILA_ENC + 1).height = 18;
  ws.getRow(FILA_ENC_FIN).height = 170;

  // Cuerpo.
  (datos.filas || []).forEach((f, i) => {
    const fila = FILA_CUERPO + i;
    cols.forEach((c, j) => {
      const cel = ws.getCell(fila, j + 1);
      let valor = null;
      let fondo = null;
      let negrita = false;
      let alinear = "center";
      let rojo = false;

      if (c.tipo === "no") valor = i + 1;
      else if (c.tipo === "nombre") { valor = aTitulo(f.nombre); alinear = "left"; }
      else if (c.tipo === "eval") valor = num(f.dims[c.dim]?.notas?.[c.idx]);
      else if (c.tipo === "prom") { valor = num(f.dims[c.dim]?.prom); negrita = true; fondo = COLOR.promedio; }
      else if (c.tipo === "total") { valor = num(f.total); negrita = true; fondo = COLOR.totalCuerpo; }
      else if (c.tipo === "autoev") { valor = num(f.autoev); fondo = COLOR.autoCuerpo; }
      else if (c.tipo === "proy") { valor = num(f.proyecto); fondo = COLOR.autoCuerpo; }
      else if (c.tipo === "calif") {
        valor = num(f.calif); negrita = true; fondo = COLOR.califCuerpo;
        rojo = valor !== null && valor < NOTA_MINIMA;
      } else if (c.tipo === "cual") { valor = f.cual || ""; fondo = COLOR.califCuerpo; }

      cel.value = valor === null ? null : valor;
      cel.font = rojo ? { size: 9, bold: negrita, color: { argb: "FFC80000" } } : { size: 9, bold: negrita };
      cel.alignment = { horizontal: alinear, vertical: "middle", indent: alinear === "left" ? 1 : 0 };
      cel.border = borde;
      if (fondo) cel.fill = relleno(fondo);
    });
    ws.getRow(fila).height = 16;
  });

  // Firmas.
  const filaFirma = FILA_CUERPO + (datos.filas || []).length + 3;
  const firma = (c1, c2, texto) => {
    unir(filaFirma, c1, filaFirma, c2);
    const cel = ws.getCell(filaFirma, c1);
    cel.value = texto;
    cel.font = { size: 9 };
    cel.alignment = { horizontal: "center" };
    for (let c = c1; c <= c2; c++) ws.getCell(filaFirma, c).border = { top: { style: "thin" } };
  };
  firma(2, Math.max(3, Math.floor(nCols * 0.3)), "MAESTRO DE ÁREA");
  firma(Math.ceil(nCols * 0.62), nCols - 1, "DIRECTORA DE UNIDAD EDUCATIVA");

  // Logo (opcional).
  if (logo) {
    try {
      const id = wb.addImage({ base64: logo.dataUrl, extension: logo.formato === "JPEG" ? "jpeg" : "png" });
      ws.addImage(id, { tl: { col: 0.1, row: 0.1 }, ext: { width: Math.min(60, 40 * (logo.w / logo.h)), height: 40 } });
    } catch (e) { /* sin logo */ }
  }

  // Impresión: horizontal, tamaño elegido, todo el ancho en una hoja y encabezado repetido.
  Object.assign(ws.pageSetup, {
    paperSize: papel.excel,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.6, header: 0.2, footer: 0.25 },
    printTitlesRow: `${FILA_TITULO}:${FILA_ENC_FIN}`,
  });
  ws.headerFooter.oddFooter = "&LImpreso el &D&CPágina &P de &N";
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: FILA_ENC_FIN }];

  return wb;
}

// ---------------------------------------------------------------------------
// Descarga (navegador)
// ---------------------------------------------------------------------------
function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Convierte el logo guardado en Configuración (data URL o URL de imagen, en cualquier formato)
// a un PNG pequeño que jsPDF y Excel puedan insertar. Si falla, el reporte sale sin logo.
export async function prepararLogo(logoUrl) {
  if (!logoUrl) return null;
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      if (!String(logoUrl).startsWith("data:")) i.crossOrigin = "anonymous";
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = logoUrl;
    });
    const escala = Math.min(1, 300 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * escala));
    const h = Math.max(1, Math.round(img.naturalHeight * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    return { dataUrl: canvas.toDataURL("image/png"), w, h, formato: "PNG" };
  } catch (e) {
    return null;
  }
}

// formato: "pdf" | "xls"      papel: "carta" | "oficio"
export async function descargarReporte(formato, papel, datos, logoUrl = null) {
  const p = PAPELES[papel];
  if (!p) throw new Error("Tamaño de papel no válido");
  const logo = await prepararLogo(logoUrl);

  if (formato === "pdf") {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [p.ancho, p.alto] });
    doc.setProperties({ title: NOMBRE_ARCHIVO });
    dibujarReportePDF(doc, datos, logo);
    doc.save(`${NOMBRE_ARCHIVO}.pdf`);
    return;
  }

  const modulo = await import("exceljs");
  const ExcelJS = modulo.default || modulo;
  const wb = await construirExcel(ExcelJS, datos, p, logo);
  const buffer = await wb.xlsx.writeBuffer();
  descargar(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${NOMBRE_ARCHIVO}.xlsx`
  );
}
