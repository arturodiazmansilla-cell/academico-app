import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Dashboard() {
  const [stats, setStats] = useState({ estudiantes: 0, profesores: 0, citaciones: 0, kardex: 0 });
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargar() {
      const [estudiantes, profesores, citaciones, kardex] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("citations").select("id", { count: "exact", head: true }),
        supabase.from("kardex").select("id", { count: "exact", head: true }),
      ]);
      setStats({
        estudiantes: estudiantes.count ?? 0,
        profesores: profesores.count ?? 0,
        citaciones: citaciones.count ?? 0,
        kardex: kardex.count ?? 0,
      });
      setCargando(false);
    }
    cargar();
  }, []);

  const metrics = [
    { label: "Estudiantes activos", value: stats.estudiantes },
    { label: "Profesores activos", value: stats.profesores },
    { label: "Citaciones registradas", value: stats.citaciones },
    { label: "Registros de kardex", value: stats.kardex },
  ];

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 border border-slate-200 rounded bg-white divide-x divide-y md:divide-y-0 divide-slate-200">
        {metrics.map((m) => (
          <div key={m.label} className="p-5">
            <p className="text-xs text-slate-500">{m.label}</p>
            <p className="font-ledger text-2xl font-semibold text-slate-900 mt-1">{cargando ? "…" : m.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded p-5">
        <h3 className="font-ledger text-base font-semibold text-slate-900 mb-2">Bienvenido</h3>
        <p className="text-sm text-slate-500">
          Usa el menú para registrar asistencia, notas, kardex o citaciones. La información que
          ves aquí se actualiza en tiempo real desde la base de datos.
        </p>
      </div>
    </div>
  );
}
