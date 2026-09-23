/**
 * Arma la tabla del "Reporte de materias" (misma TablaReporte que usan los reportes
 * de Notas), para exportarla a PDF (reportePdfTabla.ts) o Excel (reportesExcel.ts).
 */
import type { ColumnaReporte, TablaReporte } from './reportesNotas';

export type FiltroEstado = 'todas' | 'activas' | 'inactivas';

export interface MateriaConUso {
  name: string;
  code: string | null;
  description: string | null;
  active: boolean;
  actividades: number; // evaluations de la materia
  sesiones: number; // días de asistencia (class_sessions) de la materia
}

export interface OpcionesReporteMaterias {
  estado: FiltroEstado;
  incluirDescripcion: boolean;
  incluirUso: boolean;
}

export const ETIQUETA_ESTADO: Record<FiltroEstado, string> = {
  todas: 'Todas',
  activas: 'Solo activas',
  inactivas: 'Solo inactivas',
};

export function tablaMaterias(materias: MateriaConUso[], o: OpcionesReporteMaterias): TablaReporte {
  const lista = materias
    .filter((m) => o.estado === 'todas' || (o.estado === 'activas' ? m.active : !m.active))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const columnas: ColumnaReporte[] = [
    { titulo: 'N°', peso: 5, alinear: 'center' },
    { titulo: 'Materia', peso: 24 },
    { titulo: 'Sigla', peso: 9, alinear: 'center' },
  ];
  if (o.incluirDescripcion) columnas.push({ titulo: 'Descripción', peso: 30 });
  columnas.push({ titulo: 'Estado', peso: 10, alinear: 'center' });
  if (o.incluirUso) {
    columnas.push({ titulo: 'Actividades', peso: 13, alinear: 'center' });
    columnas.push({ titulo: 'Días de asistencia', peso: 13, alinear: 'center' });
  }

  const filas = lista.map((m, i) => {
    const fila: string[] = [String(i + 1), m.name, m.code || '—'];
    if (o.incluirDescripcion) fila.push(m.description || '—');
    fila.push(m.active ? 'Activa' : 'Inactiva');
    if (o.incluirUso) fila.push(String(m.actividades), String(m.sesiones));
    return fila;
  });

  const activas = materias.filter((m) => m.active).length;
  return {
    titulo: 'Reporte de materias',
    detalle: [
      ['Materias', ETIQUETA_ESTADO[o.estado]],
      ['Total registradas', String(materias.length)],
      ['Activas', String(activas)],
      ['Inactivas', String(materias.length - activas)],
    ],
    resumen: `${lista.length} materia(s) en este reporte`,
    columnas,
    filas,
    vacio: 'No hay materias que coincidan con el filtro elegido.',
  };
}
