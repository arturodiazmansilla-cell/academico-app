import { useState } from "react";
import { Upload, AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { Modal } from "../components/ui";
import { leerRegistroDesdeArchivo, emparejarAlumnos, trimestreDesdeTexto } from "../lib/importNotasExcel";

// Modal de importación de notas desde el "Registro de Calificaciones" institucional (.xlsx).
//
// Flujo:
//  1) elegir  -> el profesor sube el archivo y confirma qué trimestre leer.
//  2) revisar -> se muestra el emparejamiento de alumnos y los problemas encontrados;
//                el profesor decide a quién importar.
//  3) listo   -> resumen de lo que se guardó.
//
// Reutiliza las tablas ya existentes (evaluations, grades, term_extras) con el mismo
// esquema que usa el resto de Notas.tsx. Las actividades del Excel que no existan
// todavía en el sistema se crean automáticamente (misma dimensión + título + fecha).

const ETIQUETA_ESTADO = {
  exacto: { texto: "Coincidencia exacta", clase: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  aproximado: { texto: "Coincidencia aproximada — revisar", clase: "bg-amber-50 text-amber-700 border-amber-200" },
  sin_match: { texto: "Sin coincidencia", clase: "bg-red-50 text-red-700 border-red-200" },
};

export default function ImportarNotasModal({
  subjectId,
  courseId,
  parallelId,
  periodId,
  periodName,
  periodStartDate,
  students,
  evaluations,
  extras,
  userId,
  onClose,
  onImported,
}) {
  const [paso, setPaso] = useState("elegir"); // 'elegir' | 'revisando' | 'listo'
  const [archivo, setArchivo] = useState(null);
  const [trimestre, setTrimestre] = useState(() => trimestreDesdeTexto(periodName || "") || 1);
  const [hoja, setHoja] = useState(null);
  const [emparejamiento, setEmparejamiento] = useState(null);
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const [verProblemas, setVerProblemas] = useState(false);

  const alumnoSistemaTexto = (s) => `${s.last_name}, ${s.first_name}`;

  const leerArchivo = async () => {
    if (!archivo) return;
    setProcesando(true);
    setError("");
    try {
      const hojaLeida = await leerRegistroDesdeArchivo(archivo, trimestre);
      const sistema = students.map((s) => ({ id: s.id, nombreCompleto: `${s.first_name} ${s.last_name}` }));
      const resultadoEmp = emparejarAlumnos(hojaLeida.alumnos, sistema);
      setHoja(hojaLeida);
      setEmparejamiento(resultadoEmp);
      // Por defecto se importan los emparejamientos exactos y aproximados; "sin coincidencia" queda fuera.
      setSeleccion(
        new Set(resultadoEmp.emparejados.filter((e) => e.estado !== "sin_match").map((e) => e.alumno.fila))
      );
      setPaso("revisando");
    } catch (err) {
      setError(err?.message || "No se pudo leer el archivo. Verifica que sea el Registro de Calificaciones (.xlsx).");
    } finally {
      setProcesando(false);
    }
  };

  const alternarSeleccion = (fila) => {
    setSeleccion((prev) => {
      const copia = new Set(prev);
      if (copia.has(fila)) copia.delete(fila);
      else copia.add(fila);
      return copia;
    });
  };

  const confirmarImportacion = async () => {
    if (procesando || !hoja || !emparejamiento) return;
    setProcesando(true);
    setError("");
    try {
      // 1) Asegurar que exista una "evaluation" (actividad) por cada columna importada.
      //    Si ya existe una con la misma dimensión + título + fecha, se reutiliza.
      const mapaEvaluationId = {};
      const evaluacionesConocidas = [...evaluations];
      for (const act of hoja.actividades) {
        // La tabla evaluations guarda la dimensión en minúscula ("ser"/"saber"/"hacer"),
        // igual que el resto de la app; el parser del Excel la entrega en mayúscula.
        const dim = act.dimension.toLowerCase();
        const existente = evaluacionesConocidas.find(
          (e) =>
            e.dimension === dim &&
            (e.title || "").trim().toLowerCase() === act.titulo.trim().toLowerCase() &&
            e.evaluation_date === act.fecha
        );
        if (existente) {
          mapaEvaluationId[act.col] = existente.id;
          continue;
        }
        // El encabezado del Excel no siempre trae una fecha reconocible (por ejemplo
        // actividades de SER descritas solo con texto). En ese caso se usa el inicio
        // del trimestre como respaldo; el profesor puede corregirla después con el lápiz.
        const fechaFinal = act.fecha || periodStartDate || new Date().toISOString().slice(0, 10);
        const { data, error: errEval } = await supabase
          .from("evaluations")
          .insert({
            subject_id: subjectId,
            teacher_id: userId,
            course_id: courseId,
            parallel_id: parallelId,
            academic_period_id: periodId,
            dimension: dim,
            title: act.titulo,
            evaluation_date: fechaFinal,
            maximum_score: act.max,
          })
          .select()
          .single();
        if (errEval) throw new Error(`No se pudo crear la actividad "${act.titulo}": ${errEval.message}`);
        mapaEvaluationId[act.col] = data.id;
        evaluacionesConocidas.push(data);
      }

      // 2) Armar las notas y los extras solo de los alumnos seleccionados.
      const registrosGrades = [];
      const registrosExtras = [];
      let alumnosImportados = 0;

      for (const emp of emparejamiento.emparejados) {
        if (!seleccion.has(emp.alumno.fila) || !emp.alumnoSistema) continue;
        alumnosImportados++;
        const studentId = emp.alumnoSistema.id;

        Object.entries(emp.alumno.notas).forEach(([col, nota]) => {
          if (nota === null || nota === undefined) return;
          const evaluationId = mapaEvaluationId[col];
          if (!evaluationId) return;
          registrosGrades.push({
            student_id: studentId,
            evaluation_id: evaluationId,
            score: nota,
            registered_by: userId,
            updated_at: new Date().toISOString(),
          });
        });

        const autoevPrevio = extras?.[studentId]?.self_evaluation ?? null;
        const proyectoPrevio = extras?.[studentId]?.project_score ?? null;
        const autoev = emp.alumno.autoev !== null ? emp.alumno.autoev : autoevPrevio;
        const proyecto = emp.alumno.proyecto !== null ? emp.alumno.proyecto : proyectoPrevio;
        if (autoev !== null || proyecto !== null) {
          registrosExtras.push({
            student_id: studentId,
            subject_id: subjectId,
            course_id: courseId,
            parallel_id: parallelId,
            academic_period_id: periodId,
            self_evaluation: autoev,
            project_score: proyecto,
            updated_at: new Date().toISOString(),
          });
        }
      }

      if (registrosGrades.length > 0) {
        const { error: errGrades } = await supabase
          .from("grades")
          .upsert(registrosGrades, { onConflict: "evaluation_id,student_id" });
        if (errGrades) throw errGrades;
      }
      if (registrosExtras.length > 0) {
        const { error: errExtras } = await supabase
          .from("term_extras")
          .upsert(registrosExtras, { onConflict: "student_id,subject_id,course_id,parallel_id,academic_period_id" });
        if (errExtras) throw errExtras;
      }

      setResultado({
        actividades: hoja.actividades.length,
        notas: registrosGrades.length,
        alumnos: alumnosImportados,
        sinNotas: emparejamiento.sinNotas.length,
      });
      setPaso("listo");
    } catch (err) {
      setError(err?.message || "Ocurrió un error al importar. No se guardó nada de este intento.");
    } finally {
      setProcesando(false);
    }
  };

  const cerrarYRefrescar = async () => {
    await onImported?.();
    onClose();
  };

  /* ------------------------------------------------------------------ paso: elegir */
  if (paso === "elegir") {
    return (
      <Modal
        title="Importar notas desde Excel"
        onClose={onClose}
        maxWidth="sm:max-w-lg"
        footer={
          <>
            <button onClick={onClose} className="text-sm text-slate-600 px-4 py-2">Cancelar</button>
            <button
              onClick={leerArchivo}
              disabled={!archivo || procesando}
              className="inline-flex items-center gap-2 text-sm bg-slate-900 text-white px-4 py-2 rounded hover:bg-slate-800 disabled:opacity-50"
            >
              {procesando ? "Leyendo…" : "Leer archivo"}
            </button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-slate-700">
          <p>
            Sube el <span className="font-medium">Registro de Calificaciones</span> institucional (.xlsx). Se leerán
            las notas crudas de SER / SABER / HACER, autoevaluación y proyecto — los promedios y la calificación
            trimestral los recalcula el sistema.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Archivo</label>
            <label className="flex items-center justify-center gap-2 rounded border-2 border-dashed border-slate-300 px-4 py-6 text-slate-500 hover:border-slate-400 cursor-pointer">
              <Upload className="h-4 w-4" />
              {archivo ? archivo.name : "Selecciona el archivo .xlsx"}
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(ev) => setArchivo(ev.target.files?.[0] || null)}
              />
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Trimestre a leer (hoja REG{"{n}"})</label>
            <select
              value={trimestre}
              onChange={(ev) => setTrimestre(Number(ev.target.value))}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value={1}>1er Trimestre</option>
              <option value={2}>2do Trimestre</option>
              <option value={3}>3er Trimestre</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              Se sugiere según el trimestre seleccionado en pantalla; cámbialo si el archivo trae otra hoja.
            </p>
          </div>

          {error && (
            <p className="flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
            </p>
          )}
        </div>
      </Modal>
    );
  }

  /* ----------------------------------------------------------------- paso: revisando */
  if (paso === "revisando" && hoja && emparejamiento) {
    const { emparejados, sinNotas } = emparejamiento;
    const sinFecha = hoja.actividades.filter((a) => !a.fecha);
    const conteos = {
      exacto: emparejados.filter((e) => e.estado === "exacto").length,
      aproximado: emparejados.filter((e) => e.estado === "aproximado").length,
      sin_match: emparejados.filter((e) => e.estado === "sin_match").length,
    };

    return (
      <Modal
        title={`Revisar importación — ${hoja.hoja}`}
        onClose={onClose}
        maxWidth="sm:max-w-3xl"
        footer={
          <>
            <button onClick={() => setPaso("elegir")} className="text-sm text-slate-600 px-4 py-2">Volver</button>
            <button
              onClick={confirmarImportacion}
              disabled={procesando || seleccion.size === 0}
              className="inline-flex items-center gap-2 text-sm bg-slate-900 text-white px-4 py-2 rounded hover:bg-slate-800 disabled:opacity-50"
            >
              {procesando ? "Importando…" : `Importar ${seleccion.size} alumno(s)`}
            </button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-slate-700">
          {hoja.avisos.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1">
              {hoja.avisos.map((a, i) => <p key={i}>{a}</p>)}
            </div>
          )}

          {sinFecha.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1">
              <p className="font-medium">
                {sinFecha.length} actividad(es) no traían fecha en el encabezado del Excel; se les asignará el
                inicio del trimestre y podrás corregirla después con el lápiz en la planilla:
              </p>
              <ul className="list-disc pl-4">
                {sinFecha.map((a, i) => <li key={i}>{a.dimension} — {a.titulo}</li>)}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
              {conteos.exacto} exacto(s)
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
              {conteos.aproximado} aproximado(s)
            </span>
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-700">
              {conteos.sin_match} sin coincidencia
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
              {hoja.actividades.length} actividad(es) en el archivo
            </span>
            {hoja.problemas.length > 0 && (
              <button
                onClick={() => setVerProblemas((v) => !v)}
                className="rounded-full border border-slate-300 px-3 py-1 text-slate-600 hover:bg-slate-50"
              >
                {verProblemas ? "Ocultar" : "Ver"} {hoja.problemas.length} celda(s) con problemas
              </button>
            )}
          </div>

          {verProblemas && (
            <div className="max-h-32 overflow-y-auto rounded border border-slate-200 divide-y divide-slate-100 text-xs">
              {hoja.problemas.map((p, i) => (
                <div key={i} className="px-3 py-1.5">
                  <span className="font-medium">{p.alumno || `Fila ${p.fila}`}</span> — {p.columna}: {p.motivo}
                  {" "}(valor: {String(p.valor)})
                </div>
              ))}
            </div>
          )}

          <div className="max-h-72 overflow-y-auto rounded border border-slate-200 divide-y divide-slate-100">
            {emparejados.map((emp) => {
              const etq = ETIQUETA_ESTADO[emp.estado];
              const marcado = seleccion.has(emp.alumno.fila);
              return (
                <label
                  key={emp.alumno.fila}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={marcado}
                    disabled={!emp.alumnoSistema}
                    onChange={() => alternarSeleccion(emp.alumno.fila)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      <span className="font-medium">{emp.alumno.nombreOriginal}</span>
                      {emp.alumnoSistema && emp.estado === "aproximado" && (
                        <span className="text-slate-400"> → {alumnoSistemaTexto(
                          students.find((s) => s.id === emp.alumnoSistema.id) || { first_name: "", last_name: emp.alumnoSistema.nombreCompleto }
                        )}</span>
                      )}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${etq.clase}`}>{etq.texto}</span>
                </label>
              );
            })}
          </div>

          {sinNotas.length > 0 && (
            <p className="flex items-start gap-2 text-xs text-slate-500">
              <HelpCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {sinNotas.length} alumno(s) del sistema no aparecen en el archivo y no se modificarán:{" "}
              {sinNotas.map((a) => a.nombreCompleto).join(", ")}
            </p>
          )}

          {error && (
            <p className="flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
            </p>
          )}
        </div>
      </Modal>
    );
  }

  /* --------------------------------------------------------------------- paso: listo */
  return (
    <Modal
      title="Importación completa"
      onClose={cerrarYRefrescar}
      maxWidth="sm:max-w-md"
      footer={
        <button onClick={cerrarYRefrescar} className="text-sm bg-slate-900 text-white px-4 py-2 rounded hover:bg-slate-800">
          Cerrar
        </button>
      }
    >
      <div className="space-y-2 text-sm text-slate-700">
        <p className="flex items-center gap-2 text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> Notas importadas correctamente.
        </p>
        <ul className="list-disc pl-5 text-slate-600 space-y-0.5">
          <li>{resultado?.alumnos} alumno(s) actualizados</li>
          <li>{resultado?.notas} nota(s) guardadas</li>
          <li>{resultado?.actividades} actividad(es) leídas del archivo</li>
        </ul>
      </div>
    </Modal>
  );
}
