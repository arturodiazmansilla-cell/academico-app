import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { useSettings } from "./context/SettingsContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Alumnos from "./pages/Alumnos";
import Asistencia from "./pages/Asistencia";
import Kardex from "./pages/Kardex";
import Notas from "./pages/Notas";
import Citaciones from "./pages/Citaciones";
import Riesgo from "./pages/Riesgo";
import Reportes from "./pages/Reportes";
import CursosParalelos from "./pages/CursosParalelos";
import Materias from "./pages/admin/Materias";
import Usuarios from "./pages/Usuarios";
import Configuracion from "./pages/Configuracion";

function CursosRoute() {
  const { permissions } = useSettings();
  return (
    <ProtectedRoute adminOnly allowExtra={permissions.canManageCourses}>
      <CursosParalelos />
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/alumnos" element={<Alumnos />} />
        <Route path="/asistencia" element={<Asistencia />} />
        <Route path="/kardex" element={<Kardex />} />
        <Route path="/notas" element={<Notas />} />
        <Route path="/citaciones" element={<Citaciones />} />
        <Route path="/riesgo" element={<Riesgo />} />
        <Route path="/reportes" element={<Reportes />} />
        <Route path="/cursos" element={<CursosRoute />} />
        <Route path="/materias" element={<Materias />} />
        <Route
          path="/usuarios"
          element={
            <ProtectedRoute adminOnly>
              <Usuarios />
            </ProtectedRoute>
          }
        />
        <Route
          path="/configuracion"
          element={
            <ProtectedRoute adminOnly>
              <Configuracion />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
