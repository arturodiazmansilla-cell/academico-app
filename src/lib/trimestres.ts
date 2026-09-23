// Trimestres del año escolar (1, 2 y 3): crea los que faltan y deja activo el vigente.
// Se usa al abrir Asistencia y Notas, para que siempre exista un trimestre vigente.

const NOMBRES = ["Primer", "Segundo", "Tercer"];
// Calendario oficial de la unidad educativa. Se puede ajustar en Notas > Gestionar.
const FECHAS_BASE = { 1: ["02-02", "05-08"], 2: ["05-11", "08-31"], 3: ["09-01", "12-02"] };

export const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const nombreTrimestre = (n, anio) => `${NOMBRES[n - 1]} Trimestre ${anio}`;

// "1 Primer Trimestre 2026" / "1er Trimestre" / "Segundo Trimestre" -> 1 | 2 | 3 | null
export function numeroTrimestre(nombre) {
  const t = String(nombre || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (/\b(PRIMER|PRIMERO|1ER|1RO)\b/.test(t)) return 1;
  if (/\b(SEGUNDO|2DO)\b/.test(t)) return 2;
  if (/\b(TERCER|TERCERO|3ER|3RO)\b/.test(t)) return 3;
  const m = t.match(/^\s*([123])\b/);
  return m ? Number(m[1]) : null;
}

function sumarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Trimestre cuyas fechas contienen `fecha` (AAAA-MM-DD), o null.
export function trimestrePorFecha(periodos, fecha) {
  return (
    periodos.find((p) => p.start_date && p.start_date <= fecha && (!p.end_date || fecha <= p.end_date)) || null
  );
}

// Trimestre que corresponde a hoy; si hoy cae entre trimestres, el último que ya empezó.
export function trimestreDeHoy(periodos, hoy = hoyISO()) {
  const contiene = trimestrePorFecha(periodos, hoy);
  if (contiene) return contiene;
  const empezados = periodos.filter((p) => p.start_date && p.start_date <= hoy).sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  return empezados[0] || periodos[0] || null;
}

// Filas para insertar con los trimestres 1, 2 y 3 de `anio` que todavía no existen.
// Reconoce los ya creados aunque tengan otro nombre ("1 Primer Trimestre", "1er Trimestre"...).
export function trimestresFaltantes(periodos, anio) {
  const delAnio = periodos.filter((p) => Number(p.year) === Number(anio));
  const nuevos = [];
  let finPrevio = null;
  for (const n of [1, 2, 3]) {
    const existente = delAnio.find((p) => numeroTrimestre(p.name) === n);
    if (existente) {
      if (existente.end_date) finPrevio = existente.end_date;
      continue;
    }
    let inicio = `${anio}-${FECHAS_BASE[n][0]}`;
    let fin = `${anio}-${FECHAS_BASE[n][1]}`;
    if (finPrevio && finPrevio >= inicio) inicio = sumarDias(finPrevio, 1); // sin cruzarse con el anterior
    if (fin < inicio) fin = inicio;
    nuevos.push({ name: nombreTrimestre(n, anio), year: Number(anio), start_date: inicio, end_date: fin, active: false });
    finPrevio = fin;
  }
  return nuevos;
}

// 1) Crea los trimestres que falten de la gestión actual.
// 2) Deja exactamente un trimestre activo (el que corresponde a hoy) si no hay ninguno,
//    hay varios, o el activo ya terminó.
// Devuelve { periodos, vigente, creados, aviso }.
export async function asegurarTrimestres(supabase, hoy = hoyISO()) {
  const anio = Number(hoy.slice(0, 4));
  const leer = async () => {
    const { data, error } = await supabase.from("academic_periods").select("*").order("start_date");
    return { data: data || [], error };
  };

  let { data: periodos, error } = await leer();
  if (error) return { periodos: [], vigente: null, creados: 0, aviso: "No se pudieron leer los trimestres: " + error.message };

  let creados = 0;
  let aviso = "";

  const nuevos = trimestresFaltantes(periodos, anio);
  if (nuevos.length > 0) {
    const { error: e } = await supabase.from("academic_periods").insert(nuevos);
    if (e) aviso = "No se pudieron crear los trimestres: " + e.message;
    else {
      creados = nuevos.length;
      periodos = (await leer()).data;
    }
  }

  const activos = periodos.filter((p) => p.active);
  const objetivo = trimestreDeHoy(periodos, hoy);
  const vencido = activos.length === 1 && activos[0].end_date && activos[0].end_date < hoy;
  const hayQueCorregir = objetivo && (activos.length !== 1 || (vencido && activos[0].id !== objetivo.id));

  if (hayQueCorregir) {
    const { error: e1 } = await supabase.from("academic_periods").update({ active: false }).eq("active", true);
    const { error: e2 } = e1 ? { error: null } : await supabase.from("academic_periods").update({ active: true }).eq("id", objetivo.id);
    if (e1 || e2) aviso = aviso || "No se pudo activar el trimestre vigente: " + (e1 || e2).message;
    else periodos = (await leer()).data;
  }

  return { periodos, vigente: periodos.find((p) => p.active) || objetivo, creados, aviso };
}
