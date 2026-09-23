/**
 * Exporta un reporte a Excel (.xlsx) con formato listo para imprimir en Carta u Oficio.
 * Requiere:  npm i exceljs
 * (se carga solo cuando el usuario pulsa "Excel", así no pesa en el resto de la app)
 */
import { PAPELES, type Celda, type OpcionesSalida, type TablaReporte } from './reportesNotas';

const lineasDeCelda = (c: Celda): string[] => {
  if (typeof c === 'string') return [c];
  if (Array.isArray(c)) return c.length > 0 ? c.map((t) => `• ${t}`) : ['—'];
  return [c.texto];
};

const borde = { style: 'thin' as const, color: { argb: 'FFCBD5E1' } };
const bordes = { top: borde, left: borde, bottom: borde, right: borde };

export function nombreSeguro(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

export async function descargarExcel(
  tabla: TablaReporte,
  opciones: OpcionesSalida & { nombreArchivo: string },
): Promise<void> {
  const mod: any = await import('exceljs');
  const ExcelJS = mod.default ?? mod;

  const p = PAPELES[opciones.papel];
  const horizontal = opciones.orientacion === 'horizontal';
  const nCols = tabla.columnas.length;

  const wb = new ExcelJS.Workbook();
  wb.creator = opciones.institucion || 'Sistema académico';
  const ws = wb.addWorksheet('Reporte', {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: p.excel, // 1 = Carta, 14 = Oficio (Folio 8.5 x 13 in)
      orientation: horizontal ? 'landscape' : 'portrait',
      fitToPage: true, // ajusta todas las columnas al ancho de la hoja
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    headerFooter: { oddFooter: '&LEmitido el &D&RPágina &P de &N' },
  });

  // Ancho de columnas proporcional al papel (≈13 caracteres por pulgada útil)
  const anchoUtilPulgadas = (horizontal ? p.alto : p.ancho) - 1;
  const caracteres = anchoUtilPulgadas * 13;
  const suma = tabla.columnas.reduce((a, c) => a + c.peso, 0);
  tabla.columnas.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.max(6, (caracteres * c.peso) / suma);
  });

  const fusionada = (fila: number, texto: string, desdeCol = 1) => {
    if (nCols > desdeCol) ws.mergeCells(fila, desdeCol, fila, nCols);
    const cel = ws.getCell(fila, desdeCol);
    cel.value = texto;
    return cel;
  };

  // --- Encabezado: logo + institución
  let r = 1;
  fusionada(r, opciones.institucion || '', 2).font = { bold: true, size: 15, color: { argb: 'FF0F172A' } };
  ws.getCell(r, 2).alignment = { vertical: 'middle' };
  ws.getRow(r).height = 26;
  r++;
  fusionada(r, 'Sistema académico', 2).font = { size: 10, color: { argb: 'FF64748B' } };
  ws.getCell(r, 2).alignment = { vertical: 'top' };
  ws.getRow(r).height = 20;
  for (let c = 1; c <= nCols; c++) {
    ws.getCell(r, c).border = { bottom: { style: 'medium', color: { argb: 'FF0F172A' } } };
  }

  const m = opciones.logoUrl?.match(/^data:image\/(png|jpe?g);base64,/i);
  if (m && opciones.logoUrl) {
    const id = wb.addImage({
      base64: opciones.logoUrl,
      extension: m[1].toLowerCase().startsWith('jp') ? 'jpeg' : 'png',
    });
    ws.addImage(id, { tl: { col: 0.1, row: 0.1 }, ext: { width: 52, height: 52 } });
  }

  // --- Título y datos
  r += 2;
  const titulo = fusionada(r, tabla.titulo.toUpperCase());
  titulo.font = { bold: true, size: 13, color: { argb: 'FF0F172A' } };
  titulo.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(r).height = 24;

  const detalle: [string, string][] = opciones.docente ? [...tabla.detalle, ['Docente', opciones.docente]] : tabla.detalle;
  r += 2;
  for (let i = 0; i < detalle.length; i += 2) {
    const par = detalle.slice(i, i + 2).map(([k, v]) => `${k}: ${v}`);
    const cel = fusionada(r, par.join('        '));
    cel.font = { size: 11, color: { argb: 'FF334155' } };
    cel.alignment = { vertical: 'middle' };
    ws.getRow(r).height = 18;
    r++;
  }

  r++;
  const resumen = fusionada(r, tabla.resumen);
  resumen.font = { bold: true, size: 11 };
  r += 2;

  // --- Tabla
  if (tabla.filas.length === 0) {
    const vacio = fusionada(r, tabla.vacio);
    vacio.font = { italic: true, color: { argb: 'FF475569' } };
    vacio.alignment = { horizontal: 'center' };
    r++;
  } else {
    const filaEncabezado = r;
    const enc = ws.getRow(r);
    tabla.columnas.forEach((c, i) => {
      const cel = enc.getCell(i + 1);
      cel.value = c.titulo;
      cel.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10.5 };
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      cel.alignment = { horizontal: c.alinear === 'center' ? 'center' : 'left', vertical: 'middle', wrapText: true };
      cel.border = bordes;
    });
    enc.height = 24;
    r++;

    tabla.filas.forEach((fila, idx) => {
      const row = ws.getRow(r);
      let maxLineas = 1;
      fila.forEach((celda, i) => {
        const cel = row.getCell(i + 1);
        const lineas = lineasDeCelda(celda);
        cel.value = lineas.join('\n');
        const col = tabla.columnas[i];
        const alerta = typeof celda === 'object' && !Array.isArray(celda) && celda.alerta;
        cel.font = { size: 10.5, bold: !!alerta, color: { argb: alerta ? 'FFB91C1C' : 'FF0F172A' } };
        cel.alignment = { vertical: 'top', horizontal: col?.alinear === 'center' ? 'center' : 'left', wrapText: true };
        cel.border = bordes;
        if (idx % 2 === 1) cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        // altura estimada para que las celdas con listas se vean completas
        const ancho = (ws.getColumn(i + 1).width ?? 10) * 1.05;
        const n = lineas.reduce((s, t) => s + Math.max(1, Math.ceil(t.length / ancho)), 0);
        if (n > maxLineas) maxLineas = n;
      });
      row.height = Math.max(18, maxLineas * 14.5 + 4);
      r++;
    });

    ws.pageSetup.printTitlesRow = `${filaEncabezado}:${filaEncabezado}`; // repite el encabezado en cada hoja
  }

  r++;
  const pie = fusionada(r, `${opciones.docente ? `Docente: ${opciones.docente} · ` : ''}Emitido el ${new Date().toLocaleDateString('es-BO')}`);
  pie.font = { italic: true, size: 9.5, color: { argb: 'FF64748B' } };

  // --- Descarga
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = opciones.nombreArchivo.endsWith('.xlsx') ? opciones.nombreArchivo : `${opciones.nombreArchivo}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
