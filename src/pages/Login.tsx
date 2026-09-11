import { useState } from "react";
import { Navigate } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";

export default function Login() {
  const { session, signIn, loading } = useAuth();
  const { institutionName, logoUrl } = useSettings();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!loading && session) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    const { error: err } = await signIn(email, password);
    setEnviando(false);
    if (err) setError("Correo o contraseña incorrectos.");
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 flex-col justify-between p-12">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-emerald-600 overflow-hidden">
            {logoUrl ? <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" /> : <GraduationCap className="h-5 w-5 text-white" />}
          </div>
          <p className="font-ledger text-sm font-semibold text-white">{institutionName}</p>
        </div>
        <div>
          <p className="font-ledger text-3xl leading-snug text-white max-w-md">
            El registro del día a día escolar, ordenado en un solo lugar.
          </p>
          <div className="mt-8 flex gap-6 text-slate-400 text-sm">
            <span>Asistencia</span>
            <span>·</span>
            <span>Notas</span>
            <span>·</span>
            <span>Citaciones</span>
          </div>
        </div>
        <p className="text-xs text-slate-500">Sistema académico</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-slate-900 overflow-hidden">
              {logoUrl ? <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" /> : <GraduationCap className="h-5 w-5 text-white" />}
            </div>
            <p className="font-ledger text-sm font-semibold text-slate-900">{institutionName}</p>
          </div>
          <h2 className="font-ledger text-2xl font-semibold text-slate-900">Iniciar sesión</h2>
          <p className="text-sm text-slate-500 mt-1 mb-6">Ingresa con tu cuenta institucional.</p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Correo electrónico</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="profesor@colegio.edu.bo"
                className="w-full rounded border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Contraseña</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
              />
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={enviando}
              className="w-full rounded bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {enviando ? "Ingresando…" : "Entrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
