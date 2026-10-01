import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, FileSpreadsheet, Upload, AlertTriangle, Check, ChevronRight, FileDown, FileText, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { Field, SelectField, Modal } from "../components/ui";
import { leerArchivoAlumnos, normalizar } from "../lib/importAlumnos";
import { exportarAlumnosExcel, exportarAlumnosPdf } from "../lib/exportAlumnos";

// Campos que el archivo puede traer y que el usuario puede elegir importar.
// Un campo desmarcado: no se valida como obligatorio y no se envía a la
// base de datos (queda null), sin bloquear la fila por su ausencia.
// "nombre", "apellido", "curso" y "paralelo" son obligatorios y no se pueden desmarcar (locked).
// El Código RUDE es opcional: puede venir vacío y se guarda como null.
const CAMPOS_IMPORTABLES = [
  { key: "codigo", label: "Código RUDE (opcional)" },
  { key: "carnet", label: "Carnet" },
  { key: "nombre", label: "Nombre", locked: true },
  { key: "apellido", label: "Apellido", locked: true },
  { key: "genero", label: "Género" },
  { key: "fecha", label: "Fecha de nacimiento" },
  { key: "lugarNacimiento", label: "Lugar de nacimiento" },
  { key: "curso", label: "Curso", locked: true },
  { key: "paralelo", label: "Paralelo", locked: true },
  { key: "padre", label: "Nombre del padre/tutor" },
  { key: "telPadre", label: "Teléfono del padre" },
  { key: "madre", label: "Nombre de la madre/tutora" },
  { key: "telMadre", label: "Teléfono de la madre" },
];

// Clave para detectar alumnos repetidos: apellido + nombre + curso + paralelo,
// sin tildes ni diferencias de mayúsculas o espacios.
const clavePersona = (apellido, nombre, cursoId, paraleloId) =>
  `${normalizar(apellido)}|${normalizar(nombre)}|${cursoId ?? ""}|${paraleloId ?? ""}`;

// El campo "gender" puede venir de distintas formas según cómo se cargó el
// alumno (import del Excel oficial, alta manual, etc.): "M"/"F", "Masculino"/
// "Femenino" o "Varón"/"Mujer". Se compara por coincidencia exacta (no por
// inicial) para no confundir "Masculino" con "Mujer", que también empieza con M.
function clasificarGenero(valor) {
  const g = normalizar(valor);
  if (["M", "MASCULINO", "VARON", "HOMBRE"].includes(g)) return "M";
  if (["F", "FEMENINO", "MUJER"].includes(g)) return "F";
  return null;
}

export default function Alumnos() {
  const { isAdmin } = useAuth();
  const { permissions, institutionName } = useSettings();
  // El admin siempre puede. El profesor solo si el admin activó el permiso
  // "Importar alumnos desde Excel" en Configuración (cubre también el alta
  // uno por uno, ya que es la misma acción de fondo: crear alumnos).
  const puedeGestionarAlumnos = isAdmin || permissions.canImportStudents;

  const [alumnos, setAlumnos] = useState([]);
  const [courses, setCourses] = useState([]);
  const [parallels, setParallels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [cursoFiltro, setCursoFiltro] = useState("");
  const [paraleloFiltro, setParaleloFiltro] = useState("");
  const [mostrarInactivos, setMostrarInactivos] = useState(false); // por defecto la lista, los exportes y los informes solo muestran alumnos activos
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [filaSeleccionada, setFilaSeleccionada] = useState(null); // alumno resaltado al hacer clic en su fila
  // Fila donde está situado el usuario (bajo el puntero, último clic o foco del
  // teclado): se resalta completa en rosado, igual que en la ventana de Asistencia.
  const [filaActiva, setFilaActiva] = useState(null);
  const [editando, setEditando] = useState(null); // { id, first_name, last_name } mientras se edita el nombre
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [errorNombre, setErrorNombre] = useState("");
  const [actualizandoEstadoId, setActualizandoEstadoId] = useState(null); // id del alumno cuyo estado se está guardando

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

  // Los paralelos del filtro dependen del curso elegido. Si cambia el curso,
  // el paralelo elegido anteriormente ya no aplica y se limpia.
  const paralelosDelFiltro = useMemo(
    () => parallels.filter((p) => !cursoFiltro || p.course_id === cursoFiltro),
    [parallels, cursoFiltro]
  );

  useEffect(() => {
    setParaleloFiltro("");
  }, [cursoFiltro]);

  const filtrados = useMemo(() => {
    // normalizar() quita tildes y pasa a mayúsculas, así "Pena" encuentra a "Peña"
    // y "Munecas" encuentra a "Muñecas" (nombres compuestos frecuentes en el curso).
    const consulta = normalizar(query);
    return alumnos.filter((a) => {
      const nombreCompleto = normalizar(`${a.first_name} ${a.last_name} ${a.student_code || ""}`);
      const matchQuery = !consulta || nombreCompleto.includes(consulta);
      const matchCurso = !cursoFiltro || a.course_id === cursoFiltro;
      const matchParalelo = !paraleloFiltro || a.parallel_id === paraleloFiltro;
      const matchEstado = mostrarInactivos || a.active;
      return matchQuery && matchCurso && matchParalelo && matchEstado;
    });
  }, [alumnos, query, cursoFiltro, paraleloFiltro, mostrarInactivos]);

  // Conteo de lo que está mostrándose en pantalla ahora mismo (respeta los
  // mismos filtros que la tabla: curso, paralelo, búsqueda y mostrar inactivos).
  const conteoGenero = useMemo(() => {
    let hombres = 0, mujeres = 0;
    filtrados.forEach((a) => {
      const g = clasificarGenero(a.gender);
      if (g === "M") hombres++;
      else if (g === "F") mujeres++;
    });
    return { total: filtrados.length, hombres, mujeres };
  }, [filtrados]);

  const inactivosOcultos = useMemo(
    () => !mostrarInactivos && alumnos.some((a) => !a.active && (!cursoFiltro || a.course_id === cursoFiltro) && (!paraleloFiltro || a.parallel_id === paraleloFiltro)),
    [alumnos, mostrarInactivos, cursoFiltro, paraleloFiltro]
  );

  const seleccionarFila = (a) => {
    setFilaSeleccionada(a.id);
    setFilaActiva(a.id);
    // Si se hace clic en otra fila mientras se edita, la edición se cancela.
    if (editando && editando.id !== a.id) { setEditando(null); setErrorNombre(""); }
  };

  const iniciarEdicion = (a) => {
    if (!puedeGestionarAlumnos) return;
    setFilaSeleccionada(a.id);
    setFilaActiva(a.id);
    setEditando({ id: a.id, first_name: a.first_name || "", last_name: a.last_name || "" });
    setErrorNombre("");
  };

  const cancelarEdicion = () => { setEditando(null); setErrorNombre(""); };

  const guardarNombre = async () => {
    if (!editando || guardandoNombre) return;
    const limpiar = (t) => t.replace(/\s+/g, " ").trim().toUpperCase();
    const first_name = limpiar(editando.first_name);
    const last_name = limpiar(editando.last_name);
    if (!first_name || !last_name) { setErrorNombre("Escribe los nombres y los apellidos."); return; }

    const actual = alumnos.find((x) => x.id === editando.id);
    if (actual && actual.first_name === first_name && actual.last_name === last_name) { cancelarEdicion(); return; }

    const repetido = alumnos.some(
      (x) =>
        x.id !== editando.id &&
        x.course_id === actual?.course_id &&
        x.parallel_id === actual?.parallel_id &&
        clavePersona(x.last_name, x.first_name, x.course_id, x.parallel_id) ===
          clavePersona(last_name, first_name, actual?.course_id, actual?.parallel_id)
    );
    if (repetido) { setErrorNombre("Ya existe un alumno con ese nombre en este curso y paralelo."); return; }

    setGuardandoNombre(true);
    setErrorNombre("");
    const { error } = await supabase.from("students").update({ first_name, last_name }).eq("id", editando.id);
    setGuardandoNombre(false);
    if (error) {
      setErrorNombre(error.code === "23505" ? "Ya existe un alumno con ese nombre en este curso y paralelo." : "No se pudo guardar: " + error.message);
      return;
    }
    setAlumnos((prev) => prev.map((x) => (x.id === editando.id ? { ...x, first_name, last_name } : x)));
    setEditando(null);
  };

  // Retiro o reincorporación de un alumno durante el trimestre: no se borra el
  // registro (se conservan sus notas y asistencia), solo se marca inactivo.
  const alternarActivo = async (a) => {
    if (!puedeGestionarAlumnos || actualizandoEstadoId) return;
    const nuevoEstado = !a.active;
    const pregunta = nuevoEstado
      ? `¿Reactivar a ${a.first_name} ${a.last_name}? Volverá a aparecer en asistencia y notas.`
      : `¿Marcar a ${a.first_name} ${a.last_name} como inactivo? Dejará de aparecer en asistencia y notas, pero su historial se conserva.`;
    if (!window.confirm(pregunta)) return;
    setActualizandoEstadoId(a.id);
    const { error } = await supabase.from("students").update({ active: nuevoEstado }).eq("id", a.id);
    setActualizandoEstadoId(null);
    if (error) {
      alert("No se pudo actualizar el estado: " + error.message);
      return;
    }
    setAlumnos((prev) => prev.map((x) => (x.id === a.id ? { ...x, active: nuevoEstado } : x)));
  };

  const nombreCursoSeleccionado = courses.find((c) => c.id === cursoFiltro)?.name || "";
  const nombreParaleloSeleccionado = parallels.find((p) => p.id === paraleloFiltro)?.name || "";

  const exportarExcel = () => exportarAlumnosExcel(filtrados, nombreCursoSeleccionado, nombreParaleloSeleccionado);
  const exportarPdf = () => exportarAlumnosPdf(filtrados, institutionName, nombreCursoSeleccionado, nombreParaleloSeleccionado);

  return (
    <div className="p-4 md:p-8 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex-1 flex flex-col sm:flex-row gap-3">
          <select value={cursoFiltro} onChange={(e) => setCursoFiltro(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700">
            <option value="">Todos los cursos</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={paraleloFiltro} onChange={(e) => setParaleloFiltro(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700">
            <option value="">Todos los paralelos</option>
            {paralelosDelFiltro.map((p) => <option key={p.id} value={p.id}>Paralelo {p.name}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600 px-1">
            <input
              type="checkbox"
              checked={mostrarInactivos}
              onChange={(e) => setMostrarInactivos(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
            />
            Mostrar inactivos
          </label>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={exportarPdf}
            disabled={!cursoFiltro}
            title={!cursoFiltro ? "Selecciona un curso primero" : "Exportar a PDF (tamaño carta)"}
            className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileText className="h-4 w-4" /> Exportar PDF
          </button>
          <button
            onClick={exportarExcel}
            disabled={!cursoFiltro}
            title={!cursoFiltro ? "Selecciona un curso primero" : "Exportar a Excel"}
            className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileDown className="h-4 w-4" /> Exportar Excel
          </button>
        </div>
        {puedeGestionarAlumnos && (
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

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <label htmlFor="buscar-alumno" className="block text-xs font-medium text-slate-600 mb-1.5">
            Buscar alumno
          </label>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              id="buscar-alumno"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre, apellido o código"
              className="w-full rounded border border-slate-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
            />
          </div>
        </div>

        {cursoFiltro && conteoGenero.total > 0 && (
          <div className="flex items-center gap-3 text-sm text-slate-600 sm:pb-2">
            <span><b className="text-slate-900">{conteoGenero.total}</b> alumno{conteoGenero.total !== 1 ? "s" : ""}</span>
            <span className="text-slate-300">·</span>
            <span><b className="text-slate-900">{conteoGenero.hombres}</b> hombres</span>
            <span className="text-slate-300">·</span>
            <span><b className="text-slate-900">{conteoGenero.mujeres}</b> mujeres</span>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        {!cursoFiltro ? (
          <p className="p-6 text-sm text-slate-400 text-center">Selecciona un curso para ver la lista de alumnos.</p>
        ) : (
          <>
            {inactivosOcultos && (
              <p className="px-4 py-2 text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
                Hay alumnos inactivos en este curso/paralelo que no se están mostrando. Marca "Mostrar inactivos" para verlos.
              </p>
            )}
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
                {filtrados.map((a) => {
                  const seleccionada = filaSeleccionada === a.id;
                  const enEdicion = editando?.id === a.id;
                  const activa = filaActiva === a.id;
                  return (
                  <tr
                    key={a.id}
                    onClick={() => seleccionarFila(a)}
                    onMouseEnter={() => setFilaActiva(a.id)}
                    onFocus={() => setFilaActiva(a.id)}
                    aria-current={activa ? "true" : undefined}
                    className={`cursor-pointer transition-colors ${
                      activa
                        ? "bg-pink-200 ring-1 ring-inset ring-pink-300"
                        : seleccionada
                          ? "bg-amber-100"
                          : "hover:bg-slate-50"
                    }`}
                  >
                    <td className={`px-4 py-3 border-l-4 ${activa ? "border-l-pink-600 text-slate-700" : seleccionada ? "border-l-amber-500 text-slate-700" : "border-l-transparent text-slate-500"}`}>{a.student_code || "—"}</td>
                    <td
                      className={`px-4 py-3 ${activa ? "text-slate-900" : "text-slate-800"} ${activa || seleccionada ? "font-semibold" : ""}`}
                      onDoubleClick={() => iniciarEdicion(a)}
                      title={puedeGestionarAlumnos && !enEdicion ? "Doble clic para editar el nombre" : undefined}
                    >
                      {enEdicion ? (
                        <div
                          className="font-normal"
                          onClick={(ev) => ev.stopPropagation()}
                          onDoubleClick={(ev) => ev.stopPropagation()}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter") { ev.preventDefault(); guardarNombre(); }
                            if (ev.key === "Escape") cancelarEdicion();
                          }}
                        >
                          <div className="flex flex-wrap items-end gap-2">
                            <label className="text-[10px] uppercase tracking-wide text-slate-500">
                              Nombres
                              <input
                                autoFocus
                                value={editando.first_name}
                                onChange={(ev) => setEditando({ ...editando, first_name: ev.target.value })}
                                className="mt-0.5 block w-48 rounded border border-slate-300 bg-white px-2 py-1 text-sm normal-case tracking-normal text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                              />
                            </label>
                            <label className="text-[10px] uppercase tracking-wide text-slate-500">
                              Apellidos
                              <input
                                value={editando.last_name}
                                onChange={(ev) => setEditando({ ...editando, last_name: ev.target.value })}
                                className="mt-0.5 block w-48 rounded border border-slate-300 bg-white px-2 py-1 text-sm normal-case tracking-normal text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                              />
                            </label>
                            <button onClick={guardarNombre} disabled={guardandoNombre} title="Guardar (Enter)" aria-label="Guardar nombre" className="rounded bg-emerald-600 p-1.5 text-white hover:bg-emerald-700 disabled:opacity-50">
                              <Check className="h-4 w-4" />
                            </button>
                            <button onClick={cancelarEdicion} disabled={guardandoNombre} title="Cancelar (Esc)" aria-label="Cancelar edición" className="rounded border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          {errorNombre && <p className="mt-1 text-xs font-normal text-red-700">{errorNombre}</p>}
                        </div>
                      ) : (
                        <>{a.first_name} {a.last_name}</>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{a.courses?.name || "—"} {a.parallels?.name ? `- ${a.parallels.name}` : ""}</td>
                    <td className="px-4 py-3 text-slate-600">{a.father_name || a.mother_name || "—"}</td>
                    <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                      {puedeGestionarAlumnos ? (
                        <button
                          type="button"
                          onClick={() => alternarActivo(a)}
                          disabled={actualizandoEstadoId === a.id}
                          title={a.active ? "Clic para marcar como inactivo (retiro)" : "Clic para reactivar"}
                          className={`text-xs px-2 py-0.5 rounded-full border disabled:opacity-50 ${a.active ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"}`}
                        >
                          {actualizandoEstadoId === a.id ? "…" : a.active ? "Activo" : "Inactivo"}
                        </button>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${a.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                          {a.active ? "Activo" : "Inactivo"}
                        </span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="md:hidden divide-y divide-slate-100">
              {filtrados.map((a) => {
                const activa = filaActiva === a.id;
                const seleccionada = filaSeleccionada === a.id;
                return (
                <div
                  key={a.id}
                  onClick={() => seleccionarFila(a)}
                  onMouseEnter={() => setFilaActiva(a.id)}
                  onFocus={() => setFilaActiva(a.id)}
                  aria-current={activa ? "true" : undefined}
                  className={`p-4 flex items-center justify-between border-l-4 transition-colors ${
                    activa
                      ? "bg-pink-200 border-l-pink-600 ring-1 ring-inset ring-pink-300"
                      : seleccionada
                        ? "bg-amber-100 border-l-amber-500"
                        : "border-l-transparent"
                  }`}
                >
                  <div>
                    <p className={`text-sm ${activa ? "font-semibold text-slate-900" : "text-slate-800"}`}>{a.first_name} {a.last_name}</p>
                    <p className="text-xs text-slate-500">{a.student_code || "s/código"} · {a.courses?.name} {a.parallels?.name}</p>
                    {puedeGestionarAlumnos ? (
                      <button
                        type="button"
                        onClick={(ev) => { ev.stopPropagation(); alternarActivo(a); }}
                        disabled={actualizandoEstadoId === a.id}
                        className={`mt-1 text-xs px-2 py-0.5 rounded-full border disabled:opacity-50 ${a.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}
                      >
                        {actualizandoEstadoId === a.id ? "…" : a.active ? "Activo" : "Inactivo"}
                      </button>
                    ) : (
                      <span className={`mt-1 inline-block text-xs px-2 py-0.5 rounded-full border ${a.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                        {a.active ? "Activo" : "Inactivo"}
                      </span>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
                );
              })}
            </div>

            {puedeGestionarAlumnos && filtrados.length > 0 && (
              <p className="hidden md:block border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
                La fila bajo el puntero se resalta en rosado · clic para fijarla · doble clic en el nombre para editarlo (Enter guarda, Esc cancela).
              </p>
            )}
            {!loading && filtrados.length === 0 && <p className="p-6 text-sm text-slate-400 text-center">Sin resultados.</p>}
            {loading && <p className="p-6 text-sm text-slate-400 text-center">Cargando…</p>}
          </>
        )}
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
  const [rawRegistros, setRawRegistros] = useState(null);
  const [formato, setFormato] = useState("");
  const [error, setError] = useState("");
  const [importando, setImportando] = useState(false);
  const [selectedFields, setSelectedFields] = useState(() =>
    Object.fromEntries(CAMPOS_IMPORTABLES.map((c) => [c.key, true]))
  );
  const inputRef = useRef(null);

  const toggleCampo = (key) => {
    const campo = CAMPOS_IMPORTABLES.find((c) => c.key === key);
    if (campo?.locked) return; // nombre y apellido no se pueden desmarcar
    setSelectedFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const marcarTodos = (valor) =>
    setSelectedFields(Object.fromEntries(CAMPOS_IMPORTABLES.map((c) => [c.key, c.locked ? true : valor])));

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
        setRawRegistros(null);
        return;
      }
      setFormato(fmt);
      setRawRegistros(registros);
    } catch (err) {
      setError("No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) o CSV válido.");
      setRawRegistros(null);
    }
  };

  // Reprocesa las filas cada vez que cambian los campos seleccionados:
  // un campo desmarcado deja de exigirse como obligatorio en la validación.
  const rows = useMemo(() => {
    if (!rawRegistros) return [];
    const codigosExistentes = new Set(
      alumnosExistentes.map((a) => (a.student_code || "").trim().toLowerCase()).filter(Boolean)
    );
    const personasExistentes = new Set(
      alumnosExistentes.map((a) => clavePersona(a.last_name, a.first_name, a.course_id, a.parallel_id))
    );
    const codigosVistos = new Set();
    const personasVistas = new Set();

    return rawRegistros.map((r) => {
      const problemas = [];
      const avisos = [];
      let duplicado = false;

      if (!r.nombre || !r.apellido) problemas.push("Falta nombre o apellido");

      // Curso y paralelo son siempre obligatorios (no se pueden desmarcar).
      let curso = null;
      if (!r.curso) problemas.push("Falta curso");
      else {
        curso = buscarCurso(r.curso);
        if (!curso) problemas.push(`Curso "${r.curso}" no existe (créalo primero en Cursos)`);
      }

      let paralelo = null;
      if (!r.paralelo) problemas.push("Falta paralelo");
      else if (curso) {
        paralelo = buscarParalelo(curso.id, r.paralelo);
        if (!paralelo) problemas.push(`Paralelo "${r.paralelo}" no existe en ese curso`);
      }

      // El RUDE es opcional: sin código no se exige nada.
      let codigo = selectedFields.codigo ? r.codigo || null : null;

      if (problemas.length === 0) {
        const persona = clavePersona(r.apellido, r.nombre, curso.id, paralelo.id);
        const codigoLower = codigo ? codigo.toLowerCase() : null;

        if (personasExistentes.has(persona)) {
          duplicado = true;
          problemas.push("Ya registrado (mismo nombre, curso y paralelo)");
        } else if (personasVistas.has(persona)) {
          duplicado = true;
          problemas.push("Repetido en el archivo");
        } else if (codigoLower && codigosExistentes.has(codigoLower)) {
          duplicado = true;
          problemas.push("Código RUDE ya registrado");
        } else {
          // Mismo RUDE que otro alumno distinto del archivo: suele ser un código
          // copiado por error. Se importa el alumno sin código y se avisa.
          if (codigoLower && codigosVistos.has(codigoLower)) {
            codigo = null;
            avisos.push("RUDE repetido en el archivo: se importa sin código");
          } else if (codigoLower) {
            codigosVistos.add(codigoLower);
          }
          personasVistas.add(persona);
        }
      }

      if (r.revisarNombre) avisos.push("Revisa la separación de nombre y apellido");

      return {
        ...r,
        codigo,
        courseId: curso?.id,
        parallelId: paralelo?.id,
        valido: problemas.length === 0,
        duplicado,
        problemas,
        avisos,
      };
    });
  }, [rawRegistros, selectedFields, courses, parallels, alumnosExistentes]);

  const validas = rows.filter((r) => r.valido);
  const duplicadas = rows.filter((r) => r.duplicado);
  const conError = rows.filter((r) => !r.valido && !r.duplicado);

  const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

  const confirmar = async () => {
    setError("");
    setImportando(true);
    // Los campos desmarcados no se envían: quedan como null en la base
    // de datos, en vez de bloquear la importación por no venir en el archivo.
    const registros = validas.map((r) => ({
      student_code: r.codigo || null,
      carnet: selectedFields.carnet ? r.carnet || null : null,
      // first_name/last_name son NOT NULL en la base de datos (con default
      // ''), así que nunca se envía null aquí: si el campo está desmarcado
      // o viene vacío, se manda cadena vacía en vez de bloquear el insert.
      first_name: selectedFields.nombre ? r.nombre || "" : "",
      last_name: selectedFields.apellido ? r.apellido || "" : "",
      // Postgres rechaza el insert completo si birth_date no es una fecha
      // válida (por ejemplo, texto que parseFechaEs no logró convertir).
      birth_date: selectedFields.fecha && FECHA_ISO.test(r.fecha || "") ? r.fecha : null,
      gender: selectedFields.genero ? r.genero || null : null,
      birthplace: selectedFields.lugarNacimiento ? r.lugarNacimiento || null : null,
      course_id: r.courseId,
      parallel_id: r.parallelId,
      father_name: selectedFields.padre ? r.padre || null : null,
      father_phone: selectedFields.telPadre ? r.telPadre || null : null,
      mother_name: selectedFields.madre ? r.madre || null : null,
      mother_phone: selectedFields.telMadre ? r.telMadre || null : null,
      active: true,
    }));
    try {
      const { error: err } = await supabase.from("students").insert(registros);
      if (err) {
        setError(
          err.code === "23505"
            ? "No se pudo importar: hay alumnos que ya existen (RUDE o nombre repetido). Cierra y vuelve a abrir la importación para actualizar la lista."
            : `No se pudo importar: ${err.message}`
        );
        return;
      }
      onImported();
    } catch (err) {
      setError(`No se pudo importar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImportando(false);
    }
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
      <div className="border border-slate-200 rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-slate-700">Campos a importar</p>
          <div className="flex gap-2 text-xs">
            <button type="button" onClick={() => marcarTodos(true)} className="text-slate-500 hover:underline">Seleccionar todos</button>
            <span className="text-slate-300">·</span>
            <button type="button" onClick={() => marcarTodos(false)} className="text-slate-500 hover:underline">Ninguno</button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
          {CAMPOS_IMPORTABLES.map((campo) => (
            <label
              key={campo.key}
              className={`flex items-center gap-2 text-sm ${campo.locked ? "text-slate-400" : "text-slate-600"}`}
              title={campo.locked ? "Este campo es obligatorio y no se puede desmarcar" : undefined}
            >
              <input
                type="checkbox"
                checked={!!selectedFields[campo.key]}
                onChange={() => toggleCampo(campo.key)}
                disabled={campo.locked}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 disabled:cursor-not-allowed"
              />
              {campo.label}
              {campo.locked && <span className="text-[10px] text-slate-400">(obligatorio)</span>}
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3">Nombre, Apellido, Curso y Paralelo son obligatorios. El Código RUDE es opcional. Los alumnos ya registrados se omiten automáticamente.</p>
      </div>

      {!rawRegistros && (
        <div onClick={() => inputRef.current?.click()} className="border-2 border-dashed border-slate-300 rounded p-8 text-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/30 transition-colors">
          <Upload className="h-6 w-6 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-600">{fileName || "Haz clic para seleccionar el archivo .xlsx que envía la unidad educativa"}</p>
          <p className="text-xs text-slate-400 mt-1">Se reconoce el formato oficial (bloques por curso/paralelo) o el formato simple de columnas.</p>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
        </div>
      )}

      {error && <p className="text-sm text-red-700 flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> {error}</p>}

      {rawRegistros && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{validas.length} listas</span>
            <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">{duplicadas.length} ya registrados (se omiten)</span>
            <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">{conError.length} con errores</span>
            <span className="text-xs text-slate-400">Formato: {formato === "institucional" ? "oficial" : "simple"}</span>
            <button onClick={() => { setRawRegistros(null); setFileName(""); }} className="ml-auto text-xs text-slate-500 hover:underline">Elegir otro archivo</button>
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
                  <tr key={i} className={r.valido ? "" : r.duplicado ? "bg-amber-50/40" : "bg-red-50/40"}>
                    <td className="px-3 py-2 text-slate-500">{r.fila}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.codigo || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.nombre} {r.apellido}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.curso} {r.paralelo && `- ${r.paralelo}`}</td>
                    <td className="px-3 py-2">
                      {r.valido ? (
                        <span className="text-emerald-700 flex items-center gap-1 whitespace-nowrap"><Check className="h-3.5 w-3.5" /> Válido</span>
                      ) : (
                        <span className={r.duplicado ? "text-amber-700" : "text-red-700"}>{r.problemas.join(" · ")}</span>
                      )}
                      {r.avisos.length > 0 && <p className="text-amber-700 mt-0.5">{r.avisos.join(" · ")}</p>}
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