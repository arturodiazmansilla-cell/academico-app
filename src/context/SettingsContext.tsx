import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [institutionName, setInstitutionName] = useState("Mi Unidad Educativa");
  const [logoUrl, setLogoUrl] = useState(null);
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
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

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

  return (
    <SettingsContext.Provider
      value={{ institutionName, logoUrl, loading, refresh: load, updateSettings }}
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
