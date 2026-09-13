import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const SettingsContext = createContext(null);

const DEFAULT_THEME = {
  bgColor: "#f8fafc",
  sidebarColor: "#0f172a",
  fontColor: "#1e293b",
  fontSize: 16,
};

const DEFAULT_PERMISSIONS = {
  canImportStudents: false,
  canManageSubjects: false,
  canAssignSubjects: false,
  canManageCourses: false,
};

export function SettingsProvider({ children }) {
  const [institutionName, setInstitutionName] = useState("Mi Unidad Educativa");
  const [logoUrl, setLogoUrl] = useState(null);
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data, error } = await supabase
      .from("settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (!error && data) {
      setInstitutionName(data.institution_name || "Mi Unidad Educativa");
      setLogoUrl(data.logo_data_url || null);
      setTheme({
        bgColor: data.theme_bg_color || DEFAULT_THEME.bgColor,
        sidebarColor: data.theme_sidebar_color || DEFAULT_THEME.sidebarColor,
        fontColor: data.theme_font_color || DEFAULT_THEME.fontColor,
        fontSize: data.theme_font_size || DEFAULT_THEME.fontSize,
      });
      setPermissions({
        canImportStudents: !!data.teacher_can_import_students,
        canManageSubjects: !!data.teacher_can_manage_subjects,
        canAssignSubjects: !!data.teacher_can_assign_subjects,
        canManageCourses: !!data.teacher_can_manage_courses,
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Aplica el tema como variables CSS en el documento cada vez que cambia.
  // El tamaño de letra se aplica al <html> (rem) para que escale TODA la
  // app, ya que las clases de Tailwind (text-sm, text-xl, etc.) usan rem.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--app-bg-color", theme.bgColor);
    root.style.setProperty("--app-sidebar-color", theme.sidebarColor);
    root.style.setProperty("--app-font-color", theme.fontColor);
    root.style.fontSize = `${theme.fontSize}px`;
  }, [theme]);

  async function updateSettings({ institutionName: name, logoUrl: logo }) {
    const { error } = await supabase
      .from("settings")
      .update({
        institution_name: name,
        logo_data_url: logo,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (!error) {
      setInstitutionName(name);
      setLogoUrl(logo);
    }
    return { error };
  }

  async function updateTheme(nuevoTema) {
    const combinado = { ...theme, ...nuevoTema };
    const { error } = await supabase
      .from("settings")
      .update({
        theme_bg_color: combinado.bgColor,
        theme_sidebar_color: combinado.sidebarColor,
        theme_font_color: combinado.fontColor,
        theme_font_size: combinado.fontSize,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (!error) {
      setTheme(combinado);
    }
    return { error };
  }

  return (
    <SettingsContext.Provider
      value={{
        institutionName,
        logoUrl,
        theme,
        permissions,
        loading,
        refresh: load,
        updateSettings,
        updateTheme,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings debe usarse dentro de <SettingsProvider>");
  return ctx;
}
