import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ children, adminOnly = false, allowExtra = false }) {
  const { session, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-400">
        Cargando…
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  // allowExtra permite que una ruta "adminOnly" también sea accesible para
  // un profesor cuando el administrador le activó el permiso correspondiente
  // en Configuración (por ejemplo: gestionar Cursos).
  if (adminOnly && !isAdmin && !allowExtra) return <Navigate to="/dashboard" replace />;

  return children;
}
