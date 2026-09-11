import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";

function imprimirCitacion({ alumno, fecha, hora, motivo, observacion, institutionName, logoUrl, teacherName }) {
  const ventana = window.open("", "_blank", "width=800,height=900");
  if (!ventana) return;
  ventana.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Citación — ${alumno.first_name} ${alumno.last_name}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Georgia, 'Times New Roman', serif; color: #1e293b; padding: 48px; }
          .logo { display: block; margin: 0 auto 8px; height: 56px; object-fit: contain; }
          .institucion { text-align: center; font-family: Arial, sans-serif; font-size: 11px; color: #64748b; }
          h1 { text-align: center; font-size: 20px; margin: 6px 0 24px; }
          .info { font-family: Arial, sans-serif; font-size: 13px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 16px 0; margin-bottom: 20px; }
          .info b { color: #475569; }
          .bloque { font-family: Arial, sans-serif; font-size: 13px; margin-bottom: 16px; }
          .bloque b { display: block; color: #64748b; margin-bottom: 4px; font-weight: 600; }
          .firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 64px; font-family: Arial, sans-serif; font-size: 13px; text-align: center; }
          .firmas div { border-top: 1px solid #94a3b8; padding-top: 8px; }
          @media print { body { padding: 24px; } }
        </style>
      </head>
      <body>
        ${logoUrl ? `<img class="logo" src="${logoUrl}" />` : ""}
        <p class="institucion">${institutionName || ""}</p>
        <h1>Citación a Padre de Familia / Tutor</h1>
        <div class="info">
          <p><b>Estudiante:</b> ${alumno.first_name} ${alumno.last_name}</p>
          <p><b>Código RUDE:</b> ${alumno.student_code || "—"}</p>
          <p><b>Curso:</b> ${alumno.courses?.name || "—"}</p>
          <p><b>Paralelo:</b> ${alumno.parallels?.name || "—"}</p>
          <p><b>Padre/Tutor:</b> ${alumno.father_name || "—"}</p>
          <p><b>Madre/Tutora:</b> ${alumno.mother_name || "—"}</p>
          <p><b>Fecha de citación:</b> ${fecha}</p>
          <p><b>Hora:</b> ${hora}</p>
        </div>
        <div class="bloque"><b>Motivo</b>${motivo || "—"}</div>
        ${observacion ? `<div class="bloque"><b>Observación</b>${observacion}</div>` : ""}
        <div class="firmas">
          <div>Firma Padre/Madre/Tutor</div>
          <div>Firma Profesor${teacherName ? ` — ${teacherName}` : ""}</div>
        </div>
      </body>
    </html>
  `);
  ventana.document.close();
  ventana.focus();
  setTimeout(() => ventana.print(), 350);
}

export default function Citaciones() {
  const { user, profile, isAdmin } = useAuth();
  const { institutionName, logoUrl } = useSettings();

  const [alumnos, setAlumnos] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [alumnoId, setAlumnoId] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [hora, setHora] = useState("10:00");
  const [motivo, setMotivo] = useState("");
  const [observacion, setObservacion] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const { data: est } = await supabase.from("students").select("*, courses(name), parallels(name)").eq("active", true).order("last_name");
    setAlumnos(est || []);
    if (est && est.length > 0) setAlumnoId(est[0].id);

    const query = isAdmin
      ? supabase.from("citations").select("*, students(first_name,last_name)").order("citation_date", { ascending: false })
      : supabase.from("citations").select("*, students(first_name,last_name)").eq("teacher_id", user.id).order("citation_date", { ascending: false });
    const { data: cit } = await query;
    setHistorial(cit || []);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alumno = alumnos.find((a) => a.id === alumnoId);

  const generar = async () => {
    if (!alumno) return;
    setGuardando(true);
    await supabase.from("citations").insert({
      student_id: alumno.id, teacher_id: user.id, citation_date: fecha, citation_time: hora,
      reason: motivo, observation: observacion || null,
    });
    setGuardando(false);
    imprimirCitacion({ alumno, fecha, hora, motivo, observacion, institutionName, logoUrl, teacherName: profile?.full_name });
    setMotivo("");
    setObservacion("");
    cargar();
  };

  return (
    <div className="p-4 md:p-8 grid lg:grid-cols-5 gap-6">
      <div className="lg:col-span-2 bg-white border border-slate-200 rounded p-5 space-y-4 h-fit">
        <h3 className="font-ledger text-base font-semibold text-slate-900">Nueva citación</h3>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Estudiante</label>
          <select value={alumnoId} onChange={(e) => setAlumnoId(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            {alumnos.map((a) => <option key={a.id} value={a.id}>{a.first_name} {a.last_name} — {a.courses?.name} {a.parallels?.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Hora</label>
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Motivo</label>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Observación</label>
          <textarea value={observacion} onChange={(e) => setObservacion(e.target.value)} rows={3} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <button onClick={generar} disabled={guardando || !alumno} className="w-full inline-flex items-center justify-center gap-2 rounded bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          <Printer className="h-4 w-4" /> {guardando ? "Guardando…" : "Guardar y generar PDF"}
        </button>
      </div>

      <div className="lg:col-span-3 space-y-3">
        <p className="text-xs text-slate-500">Historial de citaciones</p>
        <div className="bg-white border border-slate-200 rounded divide-y divide-slate-100">
          {historial.map((c) => (
            <div key={c.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-800">{c.students?.first_name} {c.students?.last_name}</p>
                <p className="text-xs text-slate-500">{c.citation_date} {c.citation_time} · {c.reason}</p>
              </div>
            </div>
          ))}
          {historial.length === 0 && <p className="p-6 text-sm text-slate-400 text-center">Sin citaciones registradas todavía.</p>}
        </div>
      </div>
    </div>
  );
}
