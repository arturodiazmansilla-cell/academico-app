import { useEffect, useRef, useState } from "react";
import { GraduationCap, ImagePlus, Trash2, Check, UserCircle2, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";

export default function Configuracion() {
  const { isAdmin, profile, refreshProfile } = useAuth();
  const { institutionName, logoUrl, updateSettings } = useSettings();

  const [tempName, setTempName] = useState(institutionName);
  const [tempLogo, setTempLogo] = useState(logoUrl);
  const [savedInst, setSavedInst] = useState(false);
  const inputRef = useRef(null);

  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [savedPerfil, setSavedPerfil] = useState(false);

  // --- Permisos de profesores (nuevo) ---
  const [permisos, setPermisos] = useState({
    teacher_can_import_students: false,
    teacher_can_manage_subjects: false,
    teacher_can_assign_subjects: false,
  });
  const [cargandoPermisos, setCargandoPermisos] = useState(true);
  const [guardandoPermisos, setGuardandoPermisos] = useState(false);
  const [savedPermisos, setSavedPermisos] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data } = await supabase
        .from("settings")
        .select("teacher_can_import_students, teacher_can_manage_subjects, teacher_can_assign_subjects")
        .eq("id", 1)
        .maybeSingle();
      if (data) setPermisos(data);
      setCargandoPermisos(false);
    })();
  }, [isAdmin]);

  const cambiarPermiso = async (campo) => {
    const nuevoValor = !permisos[campo];
    setPermisos((prev) => ({ ...prev, [campo]: nuevoValor }));
    setGuardandoPermisos(true);
    const { error } = await supabase.from("settings").update({ [campo]: nuevoValor }).eq("id", 1);
    setGuardandoPermisos(false);
    if (error) {
      setPermisos((prev) => ({ ...prev, [campo]: !nuevoValor }));
      alert("No se pudo guardar el permiso: " + error.message);
      return;
    }
    setSavedPermisos(true);
    setTimeout(() => setSavedPermisos(false), 2000);
  };

  const handleLogoFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 400 * 1024) {
      alert("La imagen es muy pesada. Usa un logo de menos de 400 KB (recomendado: PNG pequeño).");
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => setTempLogo(evt.target.result);
    reader.readAsDataURL(file);
  };

  const guardarInstitucion = async () => {
    await updateSettings({ institutionName: tempName, logoUrl: tempLogo });
    setSavedInst(true);
    setTimeout(() => setSavedInst(false), 2000);
  };

  const guardarPerfil = async () => {
    await supabase.from("profiles").update({ full_name: fullName, phone }).eq("id", profile.id);
    await refreshProfile();
    setSavedPerfil(true);
    setTimeout(() => setSavedPerfil(false), 2000);
  };

  return (
    <div className="p-4 md:p-8 max-w-2xl space-y-6">
      {isAdmin && (
        <div className="bg-white border border-slate-200 rounded p-5 space-y-5">
          <div>
            <h3 className="font-ledger text-base font-semibold text-slate-900">Datos de la institución</h3>
            <p className="text-sm text-slate-500 mt-1">Aparecen en el menú, el login y las citaciones/kardex en PDF.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Nombre de la unidad educativa</label>
            <input value={tempName} onChange={(e) => setTempName(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Logo del colegio</label>
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                {tempLogo ? <img src={tempLogo} alt="Logo" className="h-full w-full object-cover" /> : <GraduationCap className="h-6 w-6 text-slate-300" />}
              </div>
              <div className="flex gap-2">
                <button onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  <ImagePlus className="h-4 w-4" /> {tempLogo ? "Cambiar logo" : "Subir logo"}
                </button>
                {tempLogo && (
                  <button onClick={() => setTempLogo(null)} className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" /> Quitar
                  </button>
                )}
                <input ref={inputRef} type="file" accept="image/*" onChange={handleLogoFile} className="hidden" />
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">Usa una imagen liviana (menos de 400 KB). Se guarda directamente en la base de datos.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={guardarInstitucion} className="rounded bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800">Guardar cambios</button>
            {savedInst && <span className="text-xs text-emerald-700 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Guardado</span>}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="bg-white border border-slate-200 rounded p-5 space-y-5">
          <div>
            <h3 className="font-ledger text-base font-semibold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-slate-400" /> Permisos de profesores
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Controla qué pueden hacer los profesores además de su trabajo diario (asistencia, notas, kardex). La configuración misma siempre queda reservada solo para administradores.
            </p>
          </div>

          {cargandoPermisos ? (
            <p className="text-sm text-slate-400">Cargando…</p>
          ) : (
            <div className="divide-y divide-slate-100">
              <PermisoToggle
                titulo="Importar alumnos desde Excel"
                descripcion="El profesor puede subir la lista de alumnos de su curso."
                activo={permisos.teacher_can_import_students}
                onToggle={() => cambiarPermiso("teacher_can_import_students")}
                deshabilitado={guardandoPermisos}
              />
              <PermisoToggle
                titulo="Gestionar materias"
                descripcion="El profesor puede crear y editar materias del colegio."
                activo={permisos.teacher_can_manage_subjects}
                onToggle={() => cambiarPermiso("teacher_can_manage_subjects")}
                deshabilitado={guardandoPermisos}
              />
              <PermisoToggle
                titulo="Asignar materia y profesor"
                descripcion="El profesor puede asignar qué materia dicta, en qué curso y paralelo (incluyendo a otros profesores)."
                activo={permisos.teacher_can_assign_subjects}
                onToggle={() => cambiarPermiso("teacher_can_assign_subjects")}
                deshabilitado={guardandoPermisos}
              />
            </div>
          )}

          {savedPermisos && <span className="text-xs text-emerald-700 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Guardado</span>}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded p-5 space-y-5">
        <div>
          <h3 className="font-ledger text-base font-semibold text-slate-900">Mi perfil</h3>
          <p className="text-sm text-slate-500 mt-1">Tu nombre aparece en citaciones, kardex y en la barra superior.</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Nombre completo</label>
          <div className="relative">
            <UserCircle2 className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ej. Prof. María Fernanda Pérez" className="w-full rounded border border-slate-300 pl-9 pr-3 py-2.5 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Teléfono</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2.5 text-sm" />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={guardarPerfil} className="rounded bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800">Guardar cambios</button>
          {savedPerfil && <span className="text-xs text-emerald-700 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Guardado</span>}
        </div>
      </div>
    </div>
  );
}

function PermisoToggle({ titulo, descripcion, activo, onToggle, deshabilitado }) {
  return (
    <div className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm text-slate-800">{titulo}</p>
        <p className="text-xs text-slate-500 mt-0.5">{descripcion}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={deshabilitado}
        aria-pressed={activo}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
          activo ? "bg-slate-900" : "bg-slate-200"
        }`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${activo ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );
}
