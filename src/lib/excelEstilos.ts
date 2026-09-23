// Estilo compartido para todas las planillas Excel del sistema:
// cabecera azul con letra negra en negrita, y borde fino en todas las celdas.

export const ESTILO_CABECERA = {
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } }, // azul
  font: { bold: true, color: { argb: "FF000000" } }, // negro
};

export const BORDE_FINO = {
  top: { style: "thin", color: { argb: "FFB0B7C3" } },
  left: { style: "thin", color: { argb: "FFB0B7C3" } },
  bottom: { style: "thin", color: { argb: "FFB0B7C3" } },
  right: { style: "thin", color: { argb: "FFB0B7C3" } },
};

// Aplica cabecera azul/negra + bordes a la tabla de la hoja (cabecera y
// datos). Las filas ANTERIORES a la cabecera (p.ej. un bloque de título)
// se dejan intactas, sin borde.
export function aplicarEstiloHoja(hoja, filaCabecera = 1) {
  const cabecera = hoja.getRow(filaCabecera);
  cabecera.eachCell({ includeEmpty: false }, (celda) => {
    celda.fill = ESTILO_CABECERA.fill;
    celda.font = ESTILO_CABECERA.font;
    celda.border = BORDE_FINO;
    celda.alignment = { vertical: "middle", horizontal: "center" };
  });

  hoja.eachRow({ includeEmpty: false }, (fila, numFila) => {
    if (numFila <= filaCabecera) return;
    fila.eachCell({ includeEmpty: false }, (celda) => {
      celda.border = BORDE_FINO;
    });
  });
}

// Dispara la descarga de un workbook de ExcelJS en el navegador.
export async function descargarWorkbook(workbook, nombreArchivo) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
