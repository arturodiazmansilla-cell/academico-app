import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, FileSpreadsheet, Upload, AlertTriangle, Check, ChevronRight } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { Field, SelectField, Modal } from "../components/ui";
import { leerArchivoAlumnos } from "../lib/importAlumnos";

export default function Alumnos() {
  const { isAdmin } = useAuth();
  const [alumnos, setAlumnos] = useState([]);
  const [courses, setCourses] = useState([]);
  const [parallels, setParallels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [cursoFiltro, setCursoFiltro] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);

  async function cargar() {
    setLoading(true);
    const [{ data: est }, { data: cur }, { data: par }] = await Promise.all([
      supabase.from("students").select("*, courses(name), parallels(name)").order("last_name"),
      supabase.from("courses").select("*").order("name"),
      supabase.from("parallels").select("*").order("name"),
    ]);
    setAlumnos(est || []);
    setCourses(cur || []);
    setParallels(par || []);
    setLoading(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  const filtrados = useMemo(() => {
    return alumnos.filter((a) => {
      const nombreCompleto = `${a.first_name} ${a.last_name} ${a.student_code || ""}`.toLowerCase();
      const matchQuery = nombreCompleto.includes(query.toLowerCase());
      const matchCurso = !cursoFiltro || a.course_id === cursoFiltro;
      return matchQuery && matchCurso;
    });
  }, [alumnos, query, cursoFiltro]);

  return (
    <div className="p-4 md:p-8 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex-1 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o código"
              className="w-full rounded border border-slate-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
            />
          </div>
          <select value={cursoFiltro} onChange={(e) => setCursoFiltro(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700">
            <option value="">Todos los cursos</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={() => setShowImport(true)} className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <FileSpreadsheet className="h-4 w-4" /> Importar Excel
            </button>
            <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              <Plus className="h-4 w-4" /> Nuevo alumno
            </button>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        <table className="w-full text-sm hidden md:table">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Curso / Paralelo</th>
              <th className="px-4 py-3 font-medium">Tutor</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtrados.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-500">{a.student_code || "—"}</td>
                <td className="px-4 py-3 text-slate-800">{a.first_name} {a.last_name}</td>
                <td className="px-4 py-3 text-slate-600">{a.courses?.name || "—"} {a.parallels?.name ? `- ${a.parallels.name}` : ""}</td>
                <td className="px-4 py-3 text-slate-600">{a.father_name || a.mother_name || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${a.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                    {a.active ? "Activo" : "Inactivo"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="md:hidden divide-y divide-slate-100">
          {filtrados.map((a) => (
            <div key={a.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-800">{a.first_name} {a.last_name}</p>
                <p className="text-xs text-slate-500">{a.student_code || "s/código"} · {a.courses?.name} {a.parallels?.name}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </div>
          ))}
        </div>

        {!loading && filtrados.length === 0 && <p className="p-6 text-sm text-slate-400 text-center">Sin resultados.</p>}
        {loading && <p className="p-6 text-sm text-slate-400 text-center">Cargando…</p>}
      </div>

      {showForm && (
        <NuevoAlumnoModal
          courses={courses}
          parallels={parallels}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); cargar(); }}
        />
      )}
      {showImport && (
        <ImportarExcelModal
          courses={courses}
          parallels={parallels}
          alumnosExistentes={alumnos}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); cargar(); }}
        />
      )}
    </div>
  );
}

function NuevoAlumnoModal({ courses, parallels, onClose, onSaved }) {
  const [form, setForm] = useState({
    student_code: "", first_name: "", last_name: "", birth_date: "",
    course_id: "", parallel_id: "", father_name: "", father_phone: "", mother_name: "", mother_phone: "",
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const set = (campo) => (valor) => setForm((prev) => ({ ...prev, [campo]: valor }));
  const paralelosDelCurso = parallels.filter((p) => p.course_id === form.course_id);

  const guardar = async () => {
    setError("");
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError("Nombre y apellido son obligatorios.");
      return;
    }
    setGuardando(true);
    const { error: err } = await supabase.from("students").insert({
      student_code: form.student_code || null,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      birth_date: form.birth_date || null,
      course_id: form.course_id || null,
      parallel_id: form.parallel_id || null,
      father_name: form.father_name || null,
      father_phone: form.father_phone || null,
      mother_name: form.mother_name || null,
      mother_phone: form.mother_phone || null,
      active: true,
    });
    setGuardando(false);
    if (err) setError(err.message);
    else onSaved();
  };

  return (
    <Modal
      title="Nuevo alumno"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="text-sm text-slate-600 px-4 py-2">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="text-sm bg-slate-900 text-white px-4 py-2 rounded hover:bg-slate-800 disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar alumno"}
          </button>
        </>
      }
    >
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Código RUDE" value={form.student_code} onChange={set("student_code")} placeholder="8198107920xxxxx" />
        <Field label="Fecha de nacimiento" type="date" value={form.birth_date} onChange={set("birth_date")} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nombre" value={form.first_name} onChange={set("first_name")} required />
        <Field label="Apellido" value={form.last_name} onChange={set("last_name")} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <SelectField label="Curso" value={form.course_id} onChange={(v) => { set("course_id")(v); set("parallel_id")(""); }} options={courses} />
        <SelectField label="Paralelo" value={form.parallel_id} onChange={set("parallel_id")} options={paralelosDelCurso} />
      </div>
      <div className="pt-2 border-t border-slate-100">
        <p className="text-xs font-medium text-slate-500 mb-3">Padre / Tutor</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre" value={form.father_name} onChange={set("father_name")} />
          <Field label="Teléfono" value={form.father_phone} onChange={set("father_phone")} />
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500 mb-3">Madre / Tutora</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre" value={form.mother_name} onChange={set("mother_name")} />
          <Field label="Teléfono" value={form.mother_phone} onChange={set("mother_phone")} />
        </div>
      </div>
    </Modal>
  );
}

function ImportarExcelModal({ courses, parallels, alumnosExistentes, onClose, onImported }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [formato, setFormato] = useState("");
  const [error, setError] = useState("");
  const [importando, setImportando] = useState(false);
  const inputRef = useRef(null);

  const codigosExistentes = new Set(alumnosExistentes.map((a) => (a.student_code || "").trim().toLowerCase()).filter(Boolean));

  const buscarCurso = (nombre) => courses.find((c) => c.name.trim().toLowerCase() === nombre.trim().toLowerCase());
  const buscarParalelo = (cursoId, nombre) => parallels.find((p) => p.course_id === cursoId && p.name.trim().toLowerCase() === nombre.trim().toLowerCase());

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setFileName(file.name);
    try {
      const { registros, formato: fmt } = await leerArchivoAlumnos(file);
      if (registros.length === 0) {
        setError("No se reconoció el formato del archivo.");
        setRows([]);
        return;
      }
      setFormato(fmt);

      const vistos = new Set();
      const procesadas = registros.map((r) => {
        const problemas = [];
        if (!r.codigo) problemas.push("Falta código");
        if (!r.nombre && !r.apellido) problemas.push("Falta nombre");
        if (!r.curso) problemas.push("Falta curso");
        if (!r.paralelo) problemas.push("Falta paralelo");

        const curso = r.curso ? buscarCurso(r.curso) : null;
        if (r.curso && !curso) problemas.push(`Curso "${r.curso}" no existe (créalo primero en Cursos)`);
        const paralelo = curso && r.paralelo ? buscarParalelo(curso.id, r.paralelo) : null;
        if (curso && r.paralelo && !paralelo) problemas.push(`Paralelo "${r.paralelo}" no existe en ese curso`);

        const codigoLower = r.codigo.toLowerCase();
        if (r.codigo && codigosExistentes.has(codigoLower)) problemas.push("Código ya registrado");
        if (r.codigo && vistos.has(codigoLower)) problemas.push("Código repetido en el archivo");
        if (r.codigo) vistos.add(codigoLower);

        return { ...r, courseId: curso?.id, parallelId: paralelo?.id, valido: problemas.length === 0, problemas };
      });
      setRows(procesadas);
    } catch (err) {
      setError("No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) o CSV válido.");
      setRows([]);
    }
  };

  const validas = rows.filter((r) => r.valido);
  const conError = rows.filter((r) => !r.valido);

  const confirmar = async () => {
    setImportando(true);
    const registros = validas.map((r) => ({
      student_code: r.codigo,
      carnet: r.carnet || null,
      first_name: r.nombre,
      last_name: r.apellido,
      birth_date: r.fecha || null,
      gender: r.genero || null,
      birthplace: r.lugarNacimiento || null,
      course_id: r.courseId,
      parallel_id: r.parallelId,
      father_name: r.padre || null,
      father_phone: r.telPadre || null,
      mother_name: r.madre || null,
      mother_phone: r.telMadre || null,
      active: true,
    }));
    const { error: err } = await supabase.from("students").insert(registros);
    setImportando(false);
    if (err) setError(err.message);
    else onImported();
  };

  return (
    <Modal title="Importar alumnos desde Excel" onClose={onClose} maxWidth="sm:max-w-4xl"
      footer={
        <>
          <button onClick={onClose} className="text-sm text-slate-600 px-4 py-2">Cancelar</button>
          <button onClick={confirmar} disabled={validas.length === 0 || importando} className="text-sm bg-slate-900 text-white px-4 py-2 rounded hover:bg-slate-800 disabled:opacity-40">
            {importando ? "Importando…" : `Confirmar importación (${validas.length})`}
          </button>
        </>
      }
    >
      {rows.length === 0 && (
        <>
          <div onClick={() => inputRef.current?.click()} className="border-2 border-dashed border-slate-300 rounded p-8 text-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/30 transition-colors">
            <Upload className="h-6 w-6 text-slate-400 mx-auto mb-2" />
            <p className="text-sm text-slate-600">{fileName || "Haz clic para seleccionar el archivo .xlsx que envía la unidad educativa"}</p>
            <p className="text-xs text-slate-400 mt-1">Se reconoce el formato oficial (bloques por curso/paralelo) o el formato simple de columnas.</p>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
          </div>
          {error && <p className="text-sm text-red-700 flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> {error}</p>}
        </>
      )}

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{validas.length} listas</span>
            <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">{conError.length} con errores</span>
            <span className="text-xs text-slate-400">Formato: {formato === "institucional" ? "oficial" : "simple"}</span>
            <button onClick={() => { setRows([]); setFileName(""); }} className="ml-auto text-xs text-slate-500 hover:underline">Elegir otro archivo</button>
          </div>
          <div className="border border-slate-200 rounded overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Fila</th>
                  <th className="px-3 py-2 text-left font-medium">Código</th>
                  <th className="px-3 py-2 text-left font-medium">Nombre</th>
                  <th className="px-3 py-2 text-left font-medium">Curso / Paralelo</th>
                  <th className="px-3 py-2 text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={i} className={r.valido ? "" : "bg-red-50/40"}>
                    <td className="px-3 py-2 text-slate-500">{r.fila}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.codigo || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.nombre} {r.apellido}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.curso} {r.paralelo && `- ${r.paralelo}`}</td>
                    <td className="px-3 py-2">
                      {r.valido ? (
                        <span className="text-emerald-700 flex items-center gap-1 whitespace-nowrap"><Check className="h-3.5 w-3.5" /> Válido</span>
                      ) : (
                        <span className="text-red-700">{r.problemas.join(" · ")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
