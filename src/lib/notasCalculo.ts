// Fórmulas de calificación compartidas por Notas.tsx (planilla en vivo) y Reportes.tsx
// (Reporte de Calificación centralizado). Un solo lugar para esta lógica evita que las
// dos pantallas terminen calculando el promedio o el total de forma distinta.

export const DIMENSIONES = [
  { key: "ser", label: "SER", max: 10 },
  { key: "saber", label: "SABER", max: 45 },
  { key: "hacer", label: "HACER", max: 40 },
];

export function evaluacionesPorDimension(evaluations, dim) {
  return evaluations.filter((e) => e.dimension === dim);
}

// Promedio simple de las notas ya cargadas en esa dimensión; null si el alumno no tiene ninguna.
export function promedioDimension(evaluations, grades, studentId, dim) {
  const evs = evaluacionesPorDimension(evaluations, dim);
  const valores = evs
    .map((e) => grades[studentId]?.[e.id])
    .filter((v) => v !== undefined && v !== null && v !== "");
  if (valores.length === 0) return null;
  const suma = valores.reduce((acc, v) => acc + Number(v), 0);
  return Math.round(suma / valores.length);
}

// Suma de los promedios de SER + SABER + HACER; null si el alumno no tiene ninguna nota todavía.
export function totalDimensiones(evaluations, grades, studentId) {
  let total = 0;
  let hayAlguno = false;
  DIMENSIONES.forEach((d) => {
    const p = promedioDimension(evaluations, grades, studentId, d.key);
    if (p !== null) { total += p; hayAlguno = true; }
  });
  return hayAlguno ? total : null;
}

// Total + autoevaluación + proyecto; null si el alumno no tiene ninguna nota todavía.
export function calificacionTrimestral(evaluations, grades, extras, studentId) {
  const total = totalDimensiones(evaluations, grades, studentId);
  if (total === null) return null;
  const auto = Number(extras[studentId]?.self_evaluation ?? 0);
  const proy = Number(extras[studentId]?.project_score ?? 0);
  return total + auto + proy;
}

// Busca el rango cualitativo (qualitative_ranges) al que pertenece una calificación.
export function cualitativoDe(qualitativeRanges, valor) {
  if (valor === null || valor === undefined) return null;
  return qualitativeRanges.find((r) => valor >= Number(r.min_score) && valor <= Number(r.max_score)) || null;
}
