import * as XLSX from "xlsx";

export function exportarKardexPDF(alumno, registros, institutionName, logoUrl, teacherName) {
  const ventana = window.open("", "_blank", "width=800,height=900");
  if (!ventana) return;

  const filas = registros.length
    ? registros
        .slice()
        .sort((a, b) => (a.incident_date < b.incident_date ? 1 : -1))
        .map(
          (r) => `<tr>
            <td>${r.incident_date}</td>
            <td>${r.type}</td>
            <td>${(r.description || "—").replace(/</g, "&lt;")}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:16px;">Sin registros de kardex</td></tr>`;

  ventana.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Kardex — ${alumno.first_name} ${alumno.last_name}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Georgia, 'Times New Roman', serif; color: #1e293b; padding: 48px; }
          .logo { display: block; margin: 0 auto 8px; height: 56px; object-fit: contain; }
          .institucion { text-align: center; font-family: Arial, sans-serif; font-size: 11px; color: #64748b; letter-spacing: 0.03em; }
          h1 { text-align: center; font-size: 20px; margin: 6px 0 24px; }
          .info { font-family: Arial, sans-serif; font-size: 13px; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 14px 0; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
          .info b { color: #475569; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12.5px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; vertical-align: top; }
          th { background: #f1f5f9; font-weight: 600; }
          .footer { margin-top: 40px; font-family: Arial, sans-serif; font-size: 11px; color: #94a3b8; text-align: right; }
          @media print { body { padding: 24px; } }
        </style>
      </head>
      <body>
        ${logoUrl ? `<img class="logo" src="${logoUrl}" />` : ""}
        <p class="institucion">${institutionName || ""}</p>
        <h1>Kardex del Estudiante</h1>
        <div class="info">
          <p><b>Estudiante:</b> ${alumno.first_name} ${alumno.last_name}</p>
          <p><b>Código RUDE:</b> ${alumno.student_code || "—"}</p>
          <p><b>Curso:</b> ${alumno.courses?.name || "—"}</p>
          <p><b>Paralelo:</b> ${alumno.parallels?.name || "—"}</p>
          <p><b>Docente responsable:</b> ${teacherName || "—"}</p>
          <p><b>Total de registros:</b> ${registros.length}</p>
        </div>
        <table>
          <thead><tr><th style="width:110px;">Fecha</th><th style="width:180px;">Tipo de falta</th><th>Descripción</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
        <p class="footer">Generado desde el sistema académico — ${institutionName || ""}</p>
      </body>
    </html>
  `);
  ventana.document.close();
  ventana.focus();
  setTimeout(() => ventana.print(), 350);
}

export function exportarKardexExcel(alumno, registros, institutionName) {
  const ordenados = registros.slice().sort((a, b) => (a.incident_date < b.incident_date ? 1 : -1));

  const filas = [
    [institutionName || "Unidad Educativa"],
    ["Kardex del Estudiante"],
    [],
    ["Estudiante", `${alumno.first_name} ${alumno.last_name}`],
    ["Código RUDE", alumno.student_code || "—"],
    ["Curso", `${alumno.courses?.name || ""} - ${alumno.parallels?.name || ""}`],
    [],
    ["Fecha", "Tipo de falta", "Descripción"],
    ...ordenados.map((r) => [r.incident_date, r.type, r.description || ""]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(filas);

  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
  ];
  ws["!cols"] = [{ wch: 13 }, { wch: 24 }, { wch: 58 }];

  const font = (extra) => ({ name: "Arial", sz: 10, ...extra });
  const estilos = {
    titulo: { font: font({ sz: 14, bold: true }), alignment: { horizontal: "center" } },
    subtitulo: { font: font({ sz: 11, color: { rgb: "64748B" } }), alignment: { horizontal: "center" } },
    etiqueta: { font: font({ bold: true }) },
    cabeceraTabla: { font: font({ bold: true, color: { rgb: "FFFFFF" } }), fill: { fgColor: { rgb: "1E293B" } } },
    celda: { font: font({}), alignment: { vertical: "top", wrapText: true } },
  };

  const aplicar = (addr, estilo) => { if (ws[addr]) ws[addr].s = estilo; };
  aplicar("A1", estilos.titulo);
  aplicar("A2", estilos.subtitulo);
  ["A4", "A5", "A6"].forEach((addr) => aplicar(addr, estilos.etiqueta));
  ["A8", "B8", "C8"].forEach((addr) => aplicar(addr, estilos.cabeceraTabla));
  ordenados.forEach((_, i) => {
    const fila = 9 + i;
    ["A", "B", "C"].forEach((col) => aplicar(`${col}${fila}`, estilos.celda));
  });

  ws["!margins"] = { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 };
  ws["!pageSetup"] = { paperSize: 1, orientation: "portrait", fitToWidth: 1, fitToHeight: 0, scale: 100 };
  ws["!printOptions"] = { horizontalCentered: true };
  ws["!headerFooter"] = {
    oddHeader: `&C&"Arial,Bold"&12${institutionName || ""} — Kardex del Estudiante`,
    oddFooter: `&L&"Arial"&8${alumno.first_name} ${alumno.last_name}&R&"Arial"&8Página &P de &N`,
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Kardex");
  const nombreArchivo = `Kardex_${alumno.last_name}_${alumno.first_name}`.trim().replace(/\s+/g, "_") + ".xlsx";
  XLSX.writeFile(wb, nombreArchivo, { cellStyles: true });
}
