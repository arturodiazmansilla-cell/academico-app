import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";

export default function ResetPassword() {
  const { updatePassword, signOut } = useAuth();
  const { institutionName, logoUrl, theme } = useSettings();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setEnviando(true);
    const { error: err } = await updatePassword(password);
    setEnviando(false);

    if (err) {
      setError("No se pudo actualizar la contraseña. El enlace puede haber expirado; solicita uno nuevo.");
      return;
    }

    setListo(true);
    // Cerramos la sesión temporal que crea el link de recuperación,
    // para que el usuario entre de nuevo con su contraseña nueva.
    await signOut();
    setTimeout(() => navigate("/login", { replace: true }), 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: theme.bgColor }}>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded overflow-hidden" style={{ backgroundColor: theme.sidebarColor }}>
            {logoUrl ? <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" /> : <GraduationCap className="h-5 w-5 text-white" />}
          </div>
          <p className="font-ledger text-sm font-semibold" style={{ color: theme.fontColor }}>{institutionName}</p>
        </div>

        {listo ? (
          <>
            <h2 className="font-ledger text-2xl font-semibold" style={{ color: theme.fontColor }}>Contraseña actualizada</h2>
            <p className="text-sm mt-2" style={{ color: theme.fontColor, opacity: 0.75 }}>
              Redirigiéndote a la página de inicio de sesión…
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2 className="font-ledger text-2xl font-semibold" style={{ color: theme.fontColor }}>Nueva contraseña</h2>
            <p className="text-sm mt-1 mb-6" style={{ color: theme.fontColor, opacity: 0.7 }}>
              Define tu nueva contraseña de acceso.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: theme.fontColor, opacity: 0.85 }}>Nueva contraseña</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: theme.fontColor, opacity: 0.85 }}>Confirmar contraseña</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>
              {error && <p className="text-sm text-red-700">{error}</p>}
              <button
                type="submit"
                disabled={enviando}
                className="w-full rounded py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: theme.sidebarColor }}
              >
                {enviando ? "Guardando…" : "Guardar nueva contraseña"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
