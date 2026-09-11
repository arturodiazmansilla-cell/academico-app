import { useEffect, useState } from "react";
import { ShieldAlert, TrendingDown } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function Riesgo() {
  const [analisis, setAnalisis] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargar() {
      const [{ data: alumnos }, { data: asistencia }, { data: kardex }, { data: notas }] = await Promise.all([
        supabase.from("students").select("*, courses(name), parallels(name)").eq("active", true),
        supabase.from("attendance").select("student_id, status"),
        supabase.from("kardex").select("student_id"),
        supabase.from("grades").select("student_id, score, evaluations(maximum_score)"),
      ]);

      const resultado = (alumnos || []).map((a) => {
        const asistenciaAlumno = (asistencia || []).filter((x) => x.student_id === a.id);
        const kardexAlumno = (kardex || []).filter((x) => x.student_id === a.id);
        const notasAlumno = (notas || []).filter((x) => x.student_id === a.id && x.score !== null);

        const asistenciaPct = asistenciaAlumno.length > 0
          ? (asistenciaAlumno.filter((x) => x.status === "present").length / asistenciaAlumno.length) * 100
          : null;

        const promedio = notasAlumno.length > 0
          ? notasAlumno.reduce((sum, n) => sum + (Number(n.score) / Number(n.evaluations?.maximum_score || 1)) * 100, 0) / notasAlumno.length
          : null;

        const motivos = [];
        if (asistenciaPct !== null && asistenciaPct < 85) motivos.push(`Asistencia ${asistenciaPct.toFixed(0)}%`);
        if (kardexAlumno.length >= 2) motivos.push(`${kardexAlumno.length} registros de kardex`);
        if (promedio !== null && promedio < 51) motivos.push(`Promedio ${promedio.toFixed(0)} pts`);

        const nivel = motivos.length >= 2 ? "alto" : motivos.length === 1 ? "medio" : "ninguno";
        return { alumno: a, motivos, nivel };
      }).filter((x) => x.nivel !== "ninguno")
        .sort((a, b) => b.motivos.length - a.motivos.length);

      setAnalisis(resultado);
      setCargando(false);
    }
    cargar();
  }, []);

  const altoRiesgo = analisis.filter((x) => x.nivel === "alto").length;
  const enObservacion = analisis.filter((x) => x.nivel === "medio").length;

  return (
    <div className="p-4 md:p-8 space-y-5">
      <div className="grid grid-cols-3 border border-slate-200 rounded bg-white divide-x divide-slate-200">
        <div className="p-5">
          <p className="text-xs text-slate-500">Estudiantes marcados</p>
          <p className="font-ledger text-2xl font-semibold text-slate-900 mt-1">{cargando ? "…" : analisis.length}</p>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-500">Alto riesgo</p>
          <p className="font-ledger text-2xl font-semibold text-red-700 mt-1">{cargando ? "…" : altoRiesgo}</p>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-500">En observación</p>
          <p className="font-ledger text-2xl font-semibold text-amber-700 mt-1">{cargando ? "…" : enObservacion}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded divide-y divide-slate-100">
        {analisis.map(({ alumno, motivos, nivel }) => (
          <div key={alumno.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${nivel === "alto" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                {nivel === "alto" ? <ShieldAlert className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              </div>
              <div>
                <p className="text-sm text-slate-800">{alumno.first_name} {alumno.last_name}</p>
                <p className="text-xs text-slate-500">{alumno.courses?.name} {alumno.parallels?.name}</p>
                <p className="text-xs text-slate-500 mt-1">{motivos.join(" · ")}</p>
              </div>
            </div>
            <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full border whitespace-nowrap ${nivel === "alto" ? "bg-red-50 text-red-700 border-red-300" : "bg-amber-50 text-amber-700 border-amber-300"}`}>
              {nivel === "alto" ? "Alto riesgo" : "En observación"}
            </span>
          </div>
        ))}
        {!cargando && analisis.length === 0 && <p className="p-6 text-sm text-slate-400 text-center">No hay estudiantes en riesgo con los criterios actuales.</p>}
      </div>

      <p className="text-xs text-slate-400">
        Criterios: asistencia menor a 85%, dos o más registros de kardex, o promedio menor a 51 puntos.
        Se calculan a partir de los registros reales de Asistencia, Kardex y Notas.
      </p>
    </div>
  );
}
