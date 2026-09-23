/**
 * Importación de notas desde el "Registro de Calificaciones" (Excel institucional).
 *
 * - Lee las hojas REG1erTRIM / REG2doTRIM / REG3erTRIM.
 * - Detecta las columnas por los encabezados (SER / SABER / HACER / PROMEDIO / AUTOEV),
 *   así que funciona aunque cada trimestre tenga distinta cantidad de columnas.
 * - NO importa los promedios, totales ni la calificación (las fórmulas del Excel):
 *   solo notas crudas. El sistema recalcula el resto.
 *
 * Este archivo no depende de xlsx: recibe la hoja como matriz (unknown[][]).
 * Para obtenerla en el navegador:  readRegSheet() (más abajo).
 */

export type Dimension = 'SER' | 'SABER' | 'HACER';
export type Trimestre = 1 | 2 | 3;
type Cell = unknown;
export type Grid = Cell[][];

export const MAX_POR_DIMENSION: Record<Dimension, number> = { SER: 10, SABER: 45, HACER: 40 };
export const MAX_AUTOEV = 5;
export const MAX_PROYECTO = 5;

export interface ActividadImportada {
  /** índice de columna (0-based) en la hoja; sirve como clave dentro de `notas` */
  col: number;
  dimension: Dimension;
  titulo: string;
  /** ISO yyyy-mm-dd si el encabezado trae fecha, si no null */
  fecha: string | null;
  max: number;
}

export interface AlumnoImportado {
  fila: number; // fila de Excel (1-based) para mostrar en errores
  nombreOriginal: string;
  /** notas por índice de columna de actividad; null = celda vacía */
  notas: Record<number, number | null>;
  autoev: number | null;
  proyecto: number | null;
  /** Calificación trimestral que traía el Excel (solo para contrastar, no se importa) */
  califExcel: number | null;
}

export interface ProblemaCelda {
  fila: number;
  alumno: string;
  columna: string;
  valor: unknown;
  motivo: string;
}

export interface HojaImportada {
  hoja: string;
  trimestre: Trimestre;
  actividades: ActividadImportada[];
  alumnos: AlumnoImportado[];
  problemas: ProblemaCelda[];
  avisos: string[];
}

/* ------------------------------------------------------------------ utilidades */

export function colLetra(idx: number): string {
  let n = idx + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const txt = (v: Cell): string =>
  v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim();

const num = (v: Cell): number | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(',', '.').trim());
  return Number.isFinite(n) ? n : NaN; // NaN = texto no numérico (se reporta como problema)
};

/** Corta en el límite de una palabra para que el encabezado de la planilla no sea enorme */
export function acortar(t: string, max: number): string {
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  const sp = corte.lastIndexOf(' ');
  return (sp > max * 0.6 ? corte.slice(0, sp) : corte).trim() + '…';
}

/** "23/3/26 Examen ..." -> { fecha: "2026-03-23", titulo: "Examen ..." } */
export function separarFechaTitulo(raw: string): { fecha: string | null; titulo: string } {
  const limpio = raw.replace(/["“”]/g, ' ').replace(/\s+/g, ' ').trim();
  const m = limpio.match(/(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2,4})/);
  if (!m) return { fecha: null, titulo: limpio };
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const valida = d >= 1 && d <= 31 && mo >= 1 && mo <= 12;
  const fecha = valida
    ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    : null;
  const titulo = limpio.replace(m[0], '').replace(/^["'\s\-–:]+|["'\s]+$/g, '').trim();
  return { fecha, titulo: titulo || limpio };
}

/* ------------------------------------------------------- nombres y emparejamiento */

/** Normaliza y ordena las palabras: "Aguilar Ferrel, Fernando" == "FERNANDO AGUILAR FERREL" */
export function tokensNombre(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort();
}

export type EstadoMatch = 'exacto' | 'aproximado' | 'sin_match';

export interface AlumnoSistema {
  id: string;
  nombreCompleto: string;
}

export interface Emparejamiento {
  alumno: AlumnoImportado;
  estado: EstadoMatch;
  alumnoSistema: AlumnoSistema | null;
}

export function emparejarAlumnos(
  importados: AlumnoImportado[],
  sistema: AlumnoSistema[],
): { emparejados: Emparejamiento[]; sinNotas: AlumnoSistema[] } {
  const sis = sistema.map((a) => ({ a, t: tokensNombre(a.nombreCompleto) }));
  const usados = new Set<string>();
  const emparejados: Emparejamiento[] = [];

  // 1) exactos (mismo conjunto de palabras)
  const pendientes: AlumnoImportado[] = [];
  for (const imp of importados) {
    const key = tokensNombre(imp.nombreOriginal).join(' ');
    const hit = sis.find((s) => !usados.has(s.a.id) && s.t.join(' ') === key);
    if (hit) {
      usados.add(hit.a.id);
      emparejados.push({ alumno: imp, estado: 'exacto', alumnoSistema: hit.a });
    } else pendientes.push(imp);
  }

  // 2) aproximados: mejor coincidencia por Jaccard >= 0.75 y sin empate
  for (const imp of pendientes) {
    const ti = new Set(tokensNombre(imp.nombreOriginal));
    const puntajes = sis
      .filter((s) => !usados.has(s.a.id))
      .map((s) => {
        const ts = new Set(s.t);
        const inter = [...ti].filter((x) => ts.has(x)).length;
        const uni = new Set([...ti, ...ts]).size;
        return { s, p: uni ? inter / uni : 0 };
      })
      .sort((x, y) => y.p - x.p);
    const mejor = puntajes[0];
    const segundo = puntajes[1];
    if (mejor && mejor.p >= 0.75 && (!segundo || mejor.p - segundo.p >= 0.1)) {
      usados.add(mejor.s.a.id);
      emparejados.push({ alumno: imp, estado: 'aproximado', alumnoSistema: mejor.s.a });
    } else {
      emparejados.push({ alumno: imp, estado: 'sin_match', alumnoSistema: null });
    }
  }

  emparejados.sort((a, b) => a.alumno.fila - b.alumno.fila);
  const sinNotas = sistema.filter((a) => !usados.has(a.id));
  return { emparejados, sinNotas };
}

/* ------------------------------------------------------------------- el parser */

const HEADER_ROWS = 18; // las cabeceras del registro están en las filas 1..18

function buscarEnCabecera(grid: Grid, re: RegExp): { fila: number; col: number } | null {
  for (let r = 0; r < Math.min(HEADER_ROWS, grid.length); r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      if (re.test(txt(row[c]))) return { fila: r, col: c };
    }
  }
  return null;
}

export function parsearRegistro(grid: Grid, hoja: string, trimestre: Trimestre): HojaImportada {
  const avisos: string[] = [];
  const problemas: ProblemaCelda[] = [];

  // --- columnas "PROMEDIO": 1º cierra SER, 2º cierra SABER, 3º cierra HACER
  const promedios: number[] = [];
  let filaProm = -1;
  for (let r = 0; r < Math.min(HEADER_ROWS, grid.length); r++) {
    const cols = (grid[r] ?? [])
      .map((v, c) => (/^PROMEDIO$/i.test(txt(v)) ? c : -1))
      .filter((c) => c >= 0);
    if (cols.length >= 3) {
      promedios.push(...cols);
      filaProm = r;
      break;
    }
  }
  if (promedios.length < 3) {
    throw new Error(
      `La hoja "${hoja}" no tiene el formato esperado (no encontré las 3 columnas PROMEDIO de SER/SABER/HACER).`,
    );
  }
  const [pSer, pSaber, pHacer] = promedios;

  const iSer = buscarEnCabecera(grid, /^SER\s*\//i);
  const iSaber = buscarEnCabecera(grid, /^SABER\s*\//i);
  const iHacer = buscarEnCabecera(grid, /^HACER\s*\//i);
  if (!iSer || !iSaber || !iHacer) {
    throw new Error(`La hoja "${hoja}" no tiene los encabezados SER / SABER / HACER.`);
  }

  // --- filas de alumnos: debajo de "APELLIDOS Y NOMBRES"
  const cab = buscarEnCabecera(grid, /APELLIDOS/i);
  const filaInicio = (cab ? cab.fila : 17) + 1;
  const filasAlumnos: number[] = [];
  for (let r = filaInicio; r < grid.length; r++) {
    const nombre = txt((grid[r] ?? [])[1]);
    if (!nombre || /MAESTR|DIRECTOR|FIRMA/i.test(nombre)) break;
    filasAlumnos.push(r);
  }
  if (!filasAlumnos.length) avisos.push(`No encontré alumnos en la hoja "${hoja}".`);

  // --- actividades: columna con encabezado o con algún dato
  const tituloDeColumna = (c: number): string => {
    for (let r = filaProm; r <= filaProm + 1; r++) {
      const t = txt((grid[r] ?? [])[c]);
      if (t && !/^PROMEDIO$/i.test(t)) return (grid[r] ?? [])[c] as string;
    }
    return '';
  };
  const tieneDatos = (c: number) =>
    filasAlumnos.some((r) => {
      const v = (grid[r] ?? [])[c];
      return v !== null && v !== undefined && txt(v) !== '';
    });

  const actividades: ActividadImportada[] = [];
  const rangos: [Dimension, number, number][] = [
    ['SER', iSer.col, pSer],
    ['SABER', iSaber.col, pSaber],
    ['HACER', iHacer.col, pHacer],
  ];
  for (const [dim, desde, hasta] of rangos) {
    let n = 0;
    for (let c = desde; c < hasta; c++) {
      const bruto = tituloDeColumna(c);
      if (!bruto && !tieneDatos(c)) continue;
      n++;
      const { fecha, titulo } = separarFechaTitulo(bruto);
      actividades.push({
        col: c,
        dimension: dim,
        titulo: acortar(titulo || `${dim} ${n}`, 60),
        fecha,
        max: MAX_POR_DIMENSION[dim],
      });
    }
  }

  // el sistema no admite dos actividades iguales (dimensión + título + fecha)
  const vistos = new Map<string, number>();
  for (const a of actividades) {
    const k = `${a.dimension}|${a.titulo.toLowerCase()}|${a.fecha ?? ''}`;
    const veces = (vistos.get(k) ?? 0) + 1;
    vistos.set(k, veces);
    if (veces > 1) a.titulo = `${a.titulo} (${veces})`;
  }

  // --- autoevaluación y proyecto
  const aut = buscarEnCabecera(grid, /AUTOEV/i);
  const calif = buscarEnCabecera(grid, /CALIFICACI[OÓ]N\s+TRIMESTRAL/i);
  const colAutoev = aut ? aut.col : pHacer + 2;
  const colProyHeader = buscarEnCabecera(grid, /^PROYECTO$/i);
  const colProy = colProyHeader
    ? colProyHeader.col
    : !calif || colAutoev + 1 < calif.col
      ? colAutoev + 1
      : -1;
  const colCalif = calif ? calif.col : -1;

  // --- notas por alumno
  const alumnos: AlumnoImportado[] = filasAlumnos.map((r) => {
    const row = grid[r] ?? [];
    const nombreOriginal = txt(row[1]);
    const notas: Record<number, number | null> = {};

    const leer = (c: number, max: number, etiqueta: string): number | null => {
      const v = num(row[c]);
      if (v === null) return null;
      if (Number.isNaN(v)) {
        problemas.push({
          fila: r + 1,
          alumno: nombreOriginal,
          columna: etiqueta,
          valor: row[c],
          motivo: 'No es un número',
        });
        return null;
      }
      if (!Number.isInteger(v)) {
        problemas.push({
          fila: r + 1,
          alumno: nombreOriginal,
          columna: etiqueta,
          valor: v,
          motivo: 'Debe ser un número entero (el sistema no admite decimales)',
        });
        return null;
      }
      if (v < 0 || v > max) {
        problemas.push({
          fila: r + 1,
          alumno: nombreOriginal,
          columna: etiqueta,
          valor: v,
          motivo: `Fuera de rango (0 a ${max})`,
        });
        return null;
      }
      return v;
    };

    for (const a of actividades) {
      notas[a.col] = leer(a.col, a.max, `${a.dimension} ${colLetra(a.col)}`);
    }
    const autoev = leer(colAutoev, MAX_AUTOEV, 'AUTOEV');
    const proyecto = colProy >= 0 ? leer(colProy, MAX_PROYECTO, 'PROYECTO') : null;
    const cv = colCalif >= 0 ? num(row[colCalif]) : null;

    return {
      fila: r + 1,
      nombreOriginal,
      notas,
      autoev,
      proyecto,
      califExcel: cv !== null && !Number.isNaN(cv) ? cv : null,
    };
  });

  if (!alumnos.some((a) => Object.values(a.notas).some((v) => v !== null))) {
    avisos.push(`La hoja "${hoja}" no tiene notas cargadas todavía.`);
  }

  return { hoja, trimestre, actividades, alumnos, problemas, avisos };
}

/* ------------------------------------------------- lectura del archivo (navegador) */

const NOMBRE_HOJA: Record<Trimestre, RegExp> = {
  1: /^REG\s*1/i,
  2: /^REG\s*2/i,
  3: /^REG\s*3/i,
};

/**
 * Lee el .xlsx y devuelve la hoja del trimestre pedido ya parseada.
 * Requiere:  npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
 */
export async function leerRegistroDesdeArchivo(
  file: File,
  trimestre: Trimestre,
): Promise<HojaImportada> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  // cellDates:false -> las fechas de encabezado vienen como texto, que es lo que necesitamos
  const wb = XLSX.read(buf, { type: 'array' });
  const nombre = wb.SheetNames.find((n) => NOMBRE_HOJA[trimestre].test(n.trim()));
  if (!nombre) {
    throw new Error(
      `El archivo no tiene la hoja del trimestre ${trimestre} (busco "REG${trimestre}...").` +
        ` Hojas encontradas: ${wb.SheetNames.join(', ')}`,
    );
  }
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombre], {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  }) as Grid;
  return parsearRegistro(grid, nombre, trimestre);
}

/** Deduce el trimestre (1/2/3) a partir del texto del selector: "1 Primer Trimestre 2026 (vigente)" */
export function trimestreDesdeTexto(t: string): Trimestre | null {
  const s = t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/primer|1er|\b1\b/.test(s)) return 1;
  if (/segundo|2do|\b2\b/.test(s)) return 2;
  if (/tercer|3er|\b3\b/.test(s)) return 3;
  return null;
}
