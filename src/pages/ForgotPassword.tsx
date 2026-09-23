import { useState } from "react";
import { Link } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";

export default function ForgotPassword() {
  const { resetPasswordForEmail } = useAuth();
  const { institutionName, logoUrl, theme } = useSettings();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    const { error: err } = await resetPasswordForEmail(email);
    setEnviando(false);
    // Por seguridad mostramos el mismo mensaje exista o no la cuenta,
    // así no revelamos qué correos están registrados.
    if (err) {
      setError("No se pudo enviar el correo. Intenta nuevamente en unos minutos.");
    } else {
      setEnviado(true);
    }
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

        {enviado ? (
          <>
            <h2 className="font-ledger text-2xl font-semibold" style={{ color: theme.fontColor }}>Revisa tu correo</h2>
            <p className="text-sm mt-2" style={{ color: theme.fontColor, opacity: 0.75 }}>
              Si <span className="font-medium">{email}</span> tiene una cuenta registrada, te enviamos un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.
            </p>
            <Link
              to="/login"
              className="inline-block mt-6 text-sm font-medium hover:underline"
              style={{ color: theme.sidebarColor }}
            >
              ← Volver a iniciar sesión
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2 className="font-ledger text-2xl font-semibold" style={{ color: theme.fontColor }}>Recuperar contraseña</h2>
            <p className="text-sm mt-1 mb-6" style={{ color: theme.fontColor, opacity: 0.7 }}>
              Ingresa tu correo institucional y te enviaremos un enlace para restablecerla.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: theme.fontColor, opacity: 0.85 }}>Correo electrónico</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="profesor@colegio.edu.bo"
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
                {enviando ? "Enviando…" : "Enviar enlace de recuperación"}
              </button>
              <Link
                to="/login"
                className="block text-center text-xs hover:underline"
                style={{ color: theme.fontColor, opacity: 0.7 }}
              >
                ← Volver a iniciar sesión
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
