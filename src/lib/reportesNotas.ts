/**
 * Lógica de los reportes de Notas.
 * Los cálculos son los mismos de la pantalla Notas:
 *   promedio de cada dimensión = promedio redondeado de sus actividades con nota,
 *   total = SER + SABER + HACER (solo las dimensiones que tienen notas),
 *   calificación trimestral = total + autoevaluación + proyecto (vacíos cuentan 0).
 */

export const NOTA_MINIMA = 51; // bajo rendimiento: calificación trimestral menor a este valor

export type DimKey = 'ser' | 'saber' | 'hacer';

export const DIMENSIONES: { key: DimKey; label: string }[] = [
  { key: 'ser', label: 'SER' },
  { key: 'saber', label: 'SABER' },
  { key: 'hacer', label: 'HACER' },
];

export interface Evaluacion {
  id: string;
  dimension: DimKey;
  title: string | null;
  evaluation_date: string | null;
}

export interface Alumno {
  id: string;
  first_name: string;
  last_name: string;
}

type Valor = number | string | null | undefined;
export type Notas = Record<string, Record<string, Valor>>; // { alumnoId: { evaluacionId: nota } }
export type Extras = Record<string, { self_evaluation?: Valor; project_score?: Valor }>;

export const hayNota = (v: Valor): boolean => v !== '' && v !== null && v !== undefined;

export const nombreAlumno = (a: Alumno): string => `${a.last_name}, ${a.first_name}`;

/* ------------------------------------------------------------------ cálculos */

export function promedioDimension(
  alumnoId: string,
  dim: DimKey,
  evaluaciones: Evaluacion[],
  notas: Notas,
): number | null {
  const valores = evaluaciones
    .filter((e) => e.dimension === dim)
    .map((e) => notas[alumnoId]?.[e.id])
    .filter(hayNota);
  if (valores.length === 0) return null;
  const suma = valores.reduce<number>((acc, v) => acc + Number(v), 0);
  return Math.round(suma / valores.length);
}

export interface ResumenAlumno {
  proms: Record<DimKey, number | null>;
  total: number | null;
  autoev: number | null;
  proyecto: number | null;
  calif: number | null;
}

export function resumenAlumno(
  alumnoId: string,
  evaluaciones: Evaluacion[],
  notas: Notas,
  extras: Extras,
): ResumenAlumno {
  const proms = {
    ser: promedioDimension(alumnoId, 'ser', evaluaciones, notas),
    saber: promedioDimension(alumnoId, 'saber', evaluaciones, notas),
    hacer: promedioDimension(alumnoId, 'hacer', evaluaciones, notas),
  };
  const hayAlguno = Object.values(proms).some((p) => p !== null);
  const total = hayAlguno ? Object.values(proms).reduce<number>((acc, p) => acc + (p ?? 0), 0) : null;
  const ex = extras[alumnoId];
  const autoev = hayNota(ex?.self_evaluation) ? Number(ex?.self_evaluation) : null;
  const proyecto = hayNota(ex?.project_score) ? Number(ex?.project_score) : null;
  const calif = total === null ? null : total + (autoev ?? 0) + (proyecto ?? 0);
  return { proms, total, autoev, proyecto, calif };
}

/* ------------------------------------------------------- reporte 1: deben examen */

export interface FilaExamen {
  alumno: Alumno;
  faltantes: Evaluacion[];
}

/**
 * Alumnos que no tienen nota en una o más actividades.
 * - dimensiones: qué dimensiones se revisan (por ejemplo solo SABER).
 * - incluirSinNotas: si es false, se omiten las actividades que NINGÚN alumno tiene calificadas
 *   todavía (normalmente aún no se tomaron o no se han cargado), para no marcar a todo el curso.
 */
export function alumnosQueDebenExamen(
  alumnos: Alumno[],
  evaluaciones: Evaluacion[],
  notas: Notas,
  opciones: { dimensiones: DimKey[]; incluirSinNotas: boolean },
): { filas: FilaExamen[]; omitidas: Evaluacion[]; revisadas: Evaluacion[] } {
  const candidatas = evaluaciones.filter((e) => opciones.dimensiones.includes(e.dimension));
  const conAlgunaNota = (e: Evaluacion) => alumnos.some((a) => hayNota(notas[a.id]?.[e.id]));
  const revisadas = opciones.incluirSinNotas ? candidatas : candidatas.filter(conAlgunaNota);
  const omitidas = opciones.incluirSinNotas ? [] : candidatas.filter((e) => !conAlgunaNota(e));

  const filas: FilaExamen[] = [];
  for (const alumno of alumnos) {
    const faltantes = revisadas.filter((e) => !hayNota(notas[alumno.id]?.[e.id]));
    if (faltantes.length > 0) filas.push({ alumno, faltantes });
  }
  return { filas, omitidas, revisadas };
}

/* ------------------------------------------------- reporte 2: bajo rendimiento */

export interface FilaBajoRendimiento {
  alumno: Alumno;
  resumen: ResumenAlumno;
}

/** Alumnos cuya calificación trimestral es menor a `minimo`. Los que no tienen ninguna nota se cuentan aparte. */
export function alumnosBajoRendimiento(
  alumnos: Alumno[],
  evaluaciones: Evaluacion[],
  notas: Notas,
  extras: Extras,
  minimo: number = NOTA_MINIMA,
): { filas: FilaBajoRendimiento[]; sinCalificacion: number } {
  const filas: FilaBajoRendimiento[] = [];
  let sinCalificacion = 0;
  for (const alumno of alumnos) {
    const resumen = resumenAlumno(alumno.id, evaluaciones, notas, extras);
    if (resumen.calif === null) sinCalificacion++;
    else if (resumen.calif < minimo) filas.push({ alumno, resumen });
  }
  filas.sort((a, b) => (a.resumen.calif as number) - (b.resumen.calif as number));
  return { filas, sinCalificacion };
}

/* ------------------------------------------------- tablas para pantalla, PDF y Excel */

export type Papel = 'carta' | 'oficio';
export type Orientacion = 'vertical' | 'horizontal';

/**
 * Carta = 8.5 x 11 pulgadas. Oficio (Bolivia) = 8.5 x 13 pulgadas.
 * `excel` es el código de tamaño de papel de Excel: 1 = Carta, 14 = Folio (8.5 x 13 in).
 */
export const PAPELES: Record<Papel, { etiqueta: string; ancho: number; alto: number; excel: number }> = {
  carta: { etiqueta: 'Carta', ancho: 8.5, alto: 11, excel: 1 },
  oficio: { etiqueta: 'Oficio', ancho: 8.5, alto: 13, excel: 14 },
};

/** Texto simple, lista (una línea con viñeta por elemento) o texto resaltado en rojo. */
export type Celda = string | string[] | { texto: string; alerta?: boolean };

export interface ColumnaReporte {
  titulo: string;
  peso: number; // ancho relativo
  alinear?: 'left' | 'center' | 'right';
}

export interface TablaReporte {
  titulo: string;
  detalle: [string, string][];
  resumen: string;
  columnas: ColumnaReporte[];
  filas: Celda[][];
  vacio: string;
}

export const fmtFecha = (d: string | null | undefined): string => (d ? d.split('-').reverse().join('/') : '');

export const textoActividad = (e: Evaluacion): string =>
  `${e.title || 'Sin título'}${e.evaluation_date ? ` (${fmtFecha(e.evaluation_date)})` : ''}`;

export function tablaExamen(
  filas: FilaExamen[],
  totalAlumnos: number,
  dimensiones: DimKey[],
  detalle: [string, string][],
): TablaReporte {
  const dims = DIMENSIONES.filter((d) => dimensiones.includes(d.key));
  const pesoDim = 62 / Math.max(dims.length, 1);
  return {
    titulo: 'Reporte de alumnos que deben examen',
    detalle: [...detalle, ['Dimensiones revisadas', dims.map((d) => d.label).join(', ') || 'ninguna']],
    resumen: `${filas.length} de ${totalAlumnos} alumnos tienen actividades sin nota.`,
    columnas: [
      { titulo: 'N°', peso: 5, alinear: 'center' },
      { titulo: 'Alumno', peso: 27 },
      ...dims.map((d) => ({ titulo: `${d.label} — sin nota`, peso: pesoDim })),
      { titulo: 'Total', peso: 6, alinear: 'center' as const },
    ],
    filas: filas.map((f, i) => [
      String(i + 1),
      nombreAlumno(f.alumno),
      ...dims.map((d) => {
        const lista = f.faltantes.filter((e) => e.dimension === d.key).map(textoActividad);
        return lista.length > 0 ? lista : '—';
      }),
      String(f.faltantes.length),
    ]),
    vacio: 'Ningún alumno tiene actividades sin nota.',
  };
}

export function tablaBajoRendimiento(
  filas: FilaBajoRendimiento[],
  totalAlumnos: number,
  detalle: [string, string][],
  cualitativo: (n: number) => string,
  minimo: number = NOTA_MINIMA,
): TablaReporte {
  const v = (n: number | null) => (n === null ? '—' : String(n));
  return {
    titulo: 'Reporte de alumnos con bajo rendimiento',
    detalle: [...detalle, ['Criterio', `Calificación trimestral menor a ${minimo}`]],
    resumen: `${filas.length} de ${totalAlumnos} alumnos tienen calificación menor a ${minimo}.`,
    columnas: [
      { titulo: 'N°', peso: 4, alinear: 'center' },
      { titulo: 'Alumno', peso: 31 },
      { titulo: 'SER', peso: 6, alinear: 'center' },
      { titulo: 'SABER', peso: 7, alinear: 'center' },
      { titulo: 'HACER', peso: 7, alinear: 'center' },
      { titulo: 'Autoev.', peso: 7, alinear: 'center' },
      { titulo: 'Proyecto', peso: 8, alinear: 'center' },
      { titulo: 'Total', peso: 6, alinear: 'center' },
      { titulo: 'Calif. trim.', peso: 9, alinear: 'center' },
      { titulo: 'Cualit.', peso: 15, alinear: 'center' },
    ],
    filas: filas.map((f, i) => [
      String(i + 1),
      nombreAlumno(f.alumno),
      v(f.resumen.proms.ser),
      v(f.resumen.proms.saber),
      v(f.resumen.proms.hacer),
      v(f.resumen.autoev),
      v(f.resumen.proyecto),
      v(f.resumen.total),
      { texto: v(f.resumen.calif), alerta: true },
      f.resumen.calif === null ? '—' : cualitativo(f.resumen.calif) || '—',
    ]),
    vacio: `Ningún alumno tiene calificación menor a ${minimo}.`,
  };
}

/* ------------------------------------------------------------ impresión / PDF */

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export interface OpcionesSalida {
  institucion: string;
  logoUrl: string | null;
  papel: Papel;
  orientacion: Orientacion;
  docente?: string;
}

const celdaHtml = (c: Celda, alinear?: string): string => {
  const cls = alinear === 'center' ? ' class="c"' : alinear === 'right' ? ' class="r"' : '';
  if (Array.isArray(c)) {
    return `<td${cls}><ul>${c.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></td>`;
  }
  if (typeof c === 'object') {
    return `<td class="${alinear === 'center' ? 'c ' : ''}${c.alerta ? 'alerta' : ''}">${esc(c.texto)}</td>`;
  }
  return c === '—' ? `<td${cls}><span class="nada">—</span></td>` : `<td${cls}>${esc(c)}</td>`;
};

export function htmlReporte(t: TablaReporte, o: OpcionesSalida): string {
  const p = PAPELES[o.papel];
  const [ancho, alto] = o.orientacion === 'horizontal' ? [p.alto, p.ancho] : [p.ancho, p.alto];
  const hoy = new Date().toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const suma = t.columnas.reduce((a, c) => a + c.peso, 0);
  const detalle: [string, string][] = o.docente ? [...t.detalle, ['Docente', o.docente]] : t.detalle;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(t.titulo)}</title>
<style>
  @page { size: ${ancho}in ${alto}in; margin: 12mm 12mm 14mm 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 11.5px; margin: 0; }
  .cab { display: flex; align-items: center; gap: 14px; padding-bottom: 8px; border-bottom: 3px solid #0f172a; }
  .cab img { height: 54px; width: auto; }
  .cab .inst { font-size: 16px; font-weight: 700; letter-spacing: .2px; }
  .cab .sub { font-size: 11px; color: #475569; margin-top: 2px; }
  .cab .fecha { margin-left: auto; text-align: right; font-size: 10.5px; color: #475569; }
  h1 { font-size: 15px; text-transform: uppercase; letter-spacing: .6px; text-align: center; margin: 14px 0 10px; }
  .detalle { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 24px; padding: 8px 10px;
             background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 3px; margin-bottom: 10px; }
  .detalle div b { color: #475569; font-weight: 700; }
  .resumen { font-weight: 700; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  th { background: #0f172a; color: #fff; padding: 6px 7px; text-align: left; font-size: 10.5px; border: 1px solid #0f172a; }
  th.c, td.c { text-align: center; }
  td { border: 1px solid #cbd5e1; padding: 5px 7px; vertical-align: top; overflow-wrap: anywhere; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  tr { page-break-inside: avoid; }
  td ul { margin: 0; padding-left: 13px; }
  td li { margin: 0 0 3px; }
  td li:last-child { margin-bottom: 0; }
  td.alerta { color: #b91c1c; font-weight: 700; }
  .nada { color: #94a3b8; }
  .vacio { padding: 18px; border: 1px dashed #94a3b8; text-align: center; color: #475569; }
  .pie { margin-top: 14px; padding-top: 6px; border-top: 1px solid #cbd5e1; font-size: 10px; color: #64748b; }
</style></head><body>
<div class="cab">
  ${o.logoUrl ? `<img src="${esc(o.logoUrl)}" alt="">` : ''}
  <div><div class="inst">${esc(o.institucion)}</div><div class="sub">Sistema académico</div></div>
  <div class="fecha">Emitido el<br><b>${hoy}</b></div>
</div>
<h1>${esc(t.titulo)}</h1>
<div class="detalle">${detalle.map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`).join('')}</div>
<p class="resumen">${esc(t.resumen)}</p>
${
  t.filas.length === 0
    ? `<div class="vacio">${esc(t.vacio)}</div>`
    : `<table>
<colgroup>${t.columnas.map((c) => `<col style="width:${((c.peso / suma) * 100).toFixed(2)}%">`).join('')}</colgroup>
<thead><tr>${t.columnas.map((c) => `<th${c.alinear === 'center' ? ' class="c"' : ''}>${esc(c.titulo)}</th>`).join('')}</tr></thead>
<tbody>${t.filas.map((f) => `<tr>${f.map((c, i) => celdaHtml(c, t.columnas[i]?.alinear)).join('')}</tr>`).join('')}</tbody>
</table>`
}
<div class="pie">${o.docente ? `Docente: ${esc(o.docente)} · ` : ''}Emitido el ${hoy}</div>
</body></html>`;
}

/** Abre el cuadro de impresión del navegador con el reporte (desde ahí se puede "Guardar como PDF"). */
export function imprimirHtml(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    iframe.remove();
    throw new Error('No se pudo preparar la impresión.');
  }
  doc.open();
  doc.write(html);
  doc.close();

  const limpiar = () => iframe.remove();
  win.onafterprint = limpiar;
  setTimeout(limpiar, 120000); // por si el navegador no avisa al terminar

  const lanzar = () => {
    win.focus();
    win.print();
  };
  const logo = doc.querySelector('img');
  if (logo && !logo.complete) {
    logo.onload = lanzar;
    logo.onerror = lanzar;
  } else {
    setTimeout(lanzar, 100);
  }
}
