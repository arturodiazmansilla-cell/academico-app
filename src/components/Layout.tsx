import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  GraduationCap, LayoutDashboard, Users, ClipboardCheck, Mail,
  FileWarning, NotebookPen, ShieldAlert, Settings, UserCog, BookOpen, LogOut,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";

const NAV = [
  { to: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { to: "/alumnos", label: "Alumnos", icon: Users },
  { to: "/asistencia", label: "Asistencia", icon: ClipboardCheck },
  { to: "/kardex", label: "Kardex", icon: FileWarning },
  { to: "/notas", label: "Notas", icon: NotebookPen },
  { to: "/citaciones", label: "Citaciones", icon: Mail },
  { to: "/riesgo", label: "Riesgo", icon: ShieldAlert },
  { to: "/cursos", label: "Cursos", icon: BookOpen, adminOnly: true },
  { to: "/usuarios", label: "Usuarios", icon: UserCog, adminOnly: true },
  { to: "/configuracion", label: "Configuración", icon: Settings, adminOnly: true },
];

function Logo({ dark }) {
  const { institutionName, logoUrl } = useSettings();
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded overflow-hidden ${dark ? "bg-emerald-600" : "bg-slate-900"}`}>
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
        ) : (
          <GraduationCap className="h-5 w-5 text-white" />
        )}
      </div>
      <div className="leading-tight min-w-0">
        <p className={`font-ledger text-sm font-semibold truncate ${dark ? "text-white" : "text-slate-900"}`}>{institutionName}</p>
        <p className={`text-[11px] ${dark ? "text-slate-400" : "text-slate-500"}`}>Sistema académico</p>
      </div>
    </div>
  );
}

export default function Layout() {
  const { profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const items = NAV.filter((n) => !n.adminOnly || isAdmin);

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "var(--app-bg-color)" }}>
      {/* Sidebar de escritorio */}
      <aside
        className="hidden md:flex md:w-60 md:flex-col md:shrink-0 border-r border-slate-800"
        style={{ backgroundColor: "var(--app-sidebar-color)" }}
      >
        <div className="px-5 py-5 border-b border-slate-800">
          <Logo dark />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 rounded px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-white/10 text-white border-l-2 border-emerald-500"
                      : "text-slate-300 hover:bg-white/5 hover:text-white border-l-2 border-transparent"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-slate-800">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 rounded px-3 py-2.5 text-sm text-slate-400 hover:bg-white/5 hover:text-white">
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col pb-14 md:pb-0 min-w-0">
        {/* Barra superior */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 md:px-8">
          <div className="md:hidden"><Logo /></div>
          <div className="hidden md:block">
            <h1 className="font-ledger text-xl font-semibold text-slate-900">
              {items.find((i) => location.pathname === i.to)?.label || "Sistema académico"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs px-2.5 py-1 rounded border border-slate-300 text-slate-600">
              {isAdmin ? "Administrador" : "Profesor"}
            </span>
            <div className="hidden sm:block text-right leading-tight">
              <p className="text-xs font-medium text-slate-700">{profile?.full_name || "Sin nombre"}</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-700 shrink-0">
              {(profile?.full_name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </div>

      {/* Menú inferior en móvil */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-20 border-t border-slate-800 flex overflow-x-auto py-1.5 px-1"
        style={{ backgroundColor: "var(--app-sidebar-color)" }}
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded text-[11px] shrink-0 ${isActive ? "text-emerald-400" : "text-slate-400"}`
              }
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
