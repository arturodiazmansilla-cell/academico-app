/**
 * Genera un PDF (texto real, no imagen) a partir de una TablaReporte, con el mismo
 * diseño que htmlReporte(): logo + institución, título, recuadro de datos, resumen,
 * tabla con encabezado oscuro que se repite en cada hoja, y pie con "Página X de N".
 *
 * Devuelve el documento jsPDF sin descargarlo, para poder mostrar primero la vista
 * previa (vistaPreviaPdf.ts) y guardar después con doc.save().
 */
import { PAPELES, type Celda, type OpcionesSalida, type TablaReporte } from './reportesNotas';
import { prepararLogo } from './reporteCalificaciones';

const MM_POR_PULGADA = 25.4;
const MARGEN = 12;
const MARGEN_INFERIOR = 16;

const OSCURO: [number, number, number] = [15, 23, 42];
const GRIS: [number, number, number] = [71, 85, 105];
const GRIS_CLARO: [number, number, number] = [100, 116, 139];
const BORDE: [number, number, number] = [203, 213, 225];

const textoCelda = (c: Celda): string => {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.length > 0 ? c.map((t) => `• ${t}`).join('\n') : '—';
  return c.texto;
};

export async function crearPdfTabla(tabla: TablaReporte, o: OpcionesSalida) {
  const { jsPDF } = await import('jspdf');
  // jspdf-autotable se publica como CommonJS: según el empaquetador, la función llega
  // como `default` o anidada en `default.default`.
  const modAutoTable: any = await import('jspdf-autotable');
  const autoTable =
    typeof modAutoTable.default === 'function' ? modAutoTable.default : modAutoTable.default?.default ?? modAutoTable.autoTable;

  const p = PAPELES[o.papel];
  const horizontal = o.orientacion === 'horizontal';
  const doc = new jsPDF({
    orientation: horizontal ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [p.ancho * MM_POR_PULGADA, p.alto * MM_POR_PULGADA],
  });
  doc.setProperties({ title: tabla.titulo, creator: o.institucion || 'Sistema académico' });

  const anchoPagina = doc.internal.pageSize.getWidth();
  const altoPagina = doc.internal.pageSize.getHeight();
  const anchoUtil = anchoPagina - MARGEN * 2;
  const hoy = new Date().toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // --- Encabezado: logo + institución + fecha
  let y = MARGEN;
  let xTexto = MARGEN;
  const logo = await prepararLogo(o.logoUrl);
  if (logo) {
    const alto = 14;
    const ancho = Math.min(30, (logo.w / logo.h) * alto);
    doc.addImage(logo.dataUrl, logo.formato, MARGEN, y, ancho, alto);
    xTexto = MARGEN + ancho + 4;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...OSCURO);
  doc.text(o.institucion || '', xTexto, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text('Sistema académico', xTexto, y + 11);
  doc.setFontSize(8.5);
  doc.text('Emitido el', anchoPagina - MARGEN, y + 5, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.text(hoy, anchoPagina - MARGEN, y + 9.5, { align: 'right' });

  y += 17;
  doc.setDrawColor(...OSCURO);
  doc.setLineWidth(0.8);
  doc.line(MARGEN, y, anchoPagina - MARGEN, y);

  // --- Título
  y += 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...OSCURO);
  doc.text(tabla.titulo.toUpperCase(), anchoPagina / 2, y, { align: 'center' });

  // --- Recuadro de datos (dos columnas)
  const detalle: [string, string][] = o.docente ? [...tabla.detalle, ['Docente', o.docente]] : tabla.detalle;
  if (detalle.length > 0) {
    y += 5;
    const filas = Math.ceil(detalle.length / 2);
    const altoRecuadro = filas * 5 + 3;
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.2);
    doc.rect(MARGEN, y, anchoUtil, altoRecuadro, 'FD');
    doc.setFontSize(9);
    detalle.forEach(([k, v], i) => {
      const x = MARGEN + 3 + (i % 2) * (anchoUtil / 2);
      const yy = y + 5 + Math.floor(i / 2) * 5;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...GRIS);
      const etiqueta = `${k}:`;
      doc.text(etiqueta, x, yy);
      // El ancho se mide con la fuente en negrita, antes de volver a la normal.
      const anchoEtiqueta = doc.getTextWidth(etiqueta) + 1.5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...OSCURO);
      doc.text(v, x + anchoEtiqueta, yy);
    });
    y += altoRecuadro;
  }

  // --- Resumen
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...OSCURO);
  doc.text(tabla.resumen, MARGEN, y);
  y += 3;

  // --- Tabla
  if (tabla.filas.length === 0) {
    y += 3;
    doc.setDrawColor(148, 163, 184);
    doc.setLineDashPattern([1.5, 1.5], 0);
    doc.rect(MARGEN, y, anchoUtil, 14);
    doc.setLineDashPattern([], 0);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRIS);
    doc.text(tabla.vacio, anchoPagina / 2, y + 8.5, { align: 'center' });
  } else {
    const suma = tabla.columnas.reduce((a, c) => a + c.peso, 0);
    const columnStyles: Record<number, { cellWidth: number; halign: 'left' | 'center' | 'right' }> = {};
    tabla.columnas.forEach((c, i) => {
      columnStyles[i] = { cellWidth: (anchoUtil * c.peso) / suma, halign: c.alinear ?? 'left' };
    });

    autoTable(doc, {
      startY: y,
      margin: { left: MARGEN, right: MARGEN, top: MARGEN, bottom: MARGEN_INFERIOR },
      head: [tabla.columnas.map((c) => c.titulo)],
      body: tabla.filas.map((f) => f.map(textoCelda)),
      showHead: 'everyPage',
      rowPageBreak: 'avoid', // una fila nunca queda partida entre dos hojas
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, textColor: OSCURO, lineColor: BORDE, lineWidth: 0.2, overflow: 'linebreak' },
      headStyles: { fillColor: OSCURO, textColor: 255, fontStyle: 'bold', lineColor: OSCURO },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles,
      didParseCell: (d) => {
        if (d.section === 'head') {
          d.cell.styles.halign = tabla.columnas[d.column.index]?.alinear ?? 'left';
          return;
        }
        const celda = tabla.filas[d.row.index]?.[d.column.index];
        if (celda && typeof celda === 'object' && !Array.isArray(celda) && celda.alerta) {
          d.cell.styles.textColor = [185, 28, 28];
          d.cell.styles.fontStyle = 'bold';
        }
        if (celda === '—') d.cell.styles.textColor = [148, 163, 184];
      },
    });
  }

  // --- Pie en todas las hojas
  const total = doc.getNumberOfPages();
  const textoPie = `${o.docente ? `Docente: ${o.docente} · ` : ''}Emitido el ${hoy}`;
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const yPie = altoPagina - MARGEN_INFERIOR + 5;
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.2);
    doc.line(MARGEN, yPie - 4, anchoPagina - MARGEN, yPie - 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS_CLARO);
    doc.text(textoPie, MARGEN, yPie);
    doc.text(`Página ${i} de ${total}`, anchoPagina - MARGEN, yPie, { align: 'right' });
  }

  return doc;
}
