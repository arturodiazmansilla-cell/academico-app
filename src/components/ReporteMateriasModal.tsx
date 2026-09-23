// Reporte de materias en dos pasos:
//  1) configurar -> tamaño de hoja (Carta u Oficio), orientación, qué materias incluir y qué columnas.
//  2) vista previa -> imagen de cada hoja del PDF ya generado; desde ahí se descarga
//                     el PDF o el Excel con la misma configuración.

import { useRef, useState } from "react";
import { FileSpreadsheet, FileText, ArrowLeft } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { Modal } from "./ui";
import { ETIQUETA_ESTADO, tablaMaterias } from "../lib/reporteMaterias";
import { PAPELES } from "../lib/reportesNotas";

// Dibujo de una hoja para elegir la orientación.
function IconoHoja({ horizontal }) {
  return (
    <span
      className={`block rounded-sm border-2 border-current bg-white ${horizontal ? "h-7 w-10" : "h-10 w-7"}`}
      aria-hidden="true"
    >
      <span className="mx-1 mt-1.5 block h-0.5 bg-current opacity-60" />
      <span className="mx-1 mt-1 block h-0.5 bg-current opacity-30" />
      <span className="mx-1 mt-1 block h-0.5 bg-current opacity-30" />
    </span>
  );
}

export default function ReporteMateriasModal({ materias, onClose }) {
  const { profile } = useAuth();
  const { institutionName, logoUrl } = useSettings();

  const [paso, setPaso] = useState("configurar");
  const [papel, setPapel] = useState("carta");
  const [orientacion, setOrientacion] = useState("vertical");
  const [estado, setEstado] = useState("todas");
  const [incluirDescripcion, setIncluirDescripcion] = useState(true);
  const [incluirUso, setIncluirUso] = useState(true);

  const [generando, setGenerando] = useState(false);
  const [imagenes, setImagenes] = useState([]);
  const [error, setError] = useState("");
  const [avisoPrevia, setAvisoPrevia] = useState("");
  const [descargando, setDescargando] = useState("");

  // Lo generado en el paso 1, para descargar exactamente lo que se ve en la vista previa.
  const generado = useRef(null);
  // Cantidad de actividades y días de asistencia por materia (se consulta una sola vez).
  const usoCache = useRef(null);

  const opcionesSalida = () => ({
    institucion: institutionName || "",
    logoUrl,
    papel,
    orientacion,
    docente: profile?.full_name || "",
  });

  async function contarUso() {
    if (usoCache.current) return usoCache.current;
    const ids = materias.map((m) => m.id);
    if (ids.length === 0) return { actividades: {}, sesiones: {} };
    const [evals, sesiones] = await Promise.all([
      supabase.from("evaluations").select("subject_id").in("subject_id", ids),
      supabase.from("class_sessions").select("subject_id").in("subject_id", ids),
    ]);
    const fallo = evals.error || sesiones.error;
    if (fallo) throw new Error(fallo.message);
    const contar = (filas) =>
      (filas || []).reduce((acc, r) => ({ ...acc, [r.subject_id]: (acc[r.subject_id] || 0) + 1 }), {});
    usoCache.current = { actividades: contar(evals.data), sesiones: contar(sesiones.data) };
    return usoCache.current;
  }

  async function generarVistaPrevia() {
    if (generando) return;
    setGenerando(true);
    setError("");
    setAvisoPrevia("");
    try {
      const uso = incluirUso ? await contarUso() : { actividades: {}, sesiones: {} };
      const tabla = tablaMaterias(
        materias.map((m) => ({
          name: m.name,
          code: m.code,
          description: m.description,
          active: m.active,
          actividades: uso.actividades[m.id] || 0,
          sesiones: uso.sesiones[m.id] || 0,
        })),
        { estado, incluirDescripcion, incluirUso }
      );
      const opciones = opcionesSalida();
      const { crearPdfTabla } = await import("../lib/reportePdfTabla");
      const doc = await crearPdfTabla(tabla, opciones);
      generado.current = { tabla, opciones, doc };

      try {
        const { pdfAImagenes } = await import("../lib/vistaPreviaPdf");
        setImagenes(await pdfAImagenes(doc.output("arraybuffer")));
      } catch (e) {
        // El reporte sí se generó: se permite descargarlo aunque la imagen no se pueda mostrar.
        setImagenes([]);
        setAvisoPrevia(
          "No se pudo dibujar la imagen previa en este navegador (" + (e?.message || "error desconocido") +
            "). Igual puedes descargar el reporte."
        );
      }
      setPaso("previa");
    } catch (e) {
      setError("No se pudo generar el reporte: " + (e?.message || "error desconocido"));
    } finally {
      setGenerando(false);
    }
  }

  const nombreArchivo = () => `Reporte_materias_${new Date().toISOString().slice(0, 10)}`;

  function descargarPdf() {
    generado.current?.doc.save(`${nombreArchivo()}.pdf`);
  }

  async function descargarXls() {
    if (!generado.current || descargando) return;
    setDescargando("xls");
    try {
      const { descargarExcel } = await import("../lib/reportesExcel");
      await descargarExcel(generado.current.tabla, { ...generado.current.opciones, nombreArchivo: nombreArchivo() });
    } catch (e) {
      alert("No se pudo generar el Excel: " + (e?.message || "error desconocido"));
    } finally {
      setDescargando("");
    }
  }

  if (paso === "previa") {
    const horizontal = generado.current?.opciones.orientacion === "horizontal";
    const hoja = PAPELES[generado.current?.opciones.papel] ?? PAPELES.carta;
    return (
      <Modal
        title="Vista previa · Reporte de materias"
        onClose={onClose}
        maxWidth="sm:max-w-4xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setPaso("configurar")}
              className="mr-auto inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" /> Cambiar configuración
            </button>
            <button
              type="button"
              onClick={descargarXls}
              disabled={!!descargando}
              className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" /> {descargando === "xls" ? "Generando…" : "Descargar Excel"}
            </button>
            <button
              type="button"
              onClick={descargarPdf}
              className="inline-flex items-center gap-2 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              <FileText className="h-4 w-4" /> Descargar PDF
            </button>
          </>
        }
      >
        <p className="text-xs text-slate-500">
          {hoja.etiqueta} · {horizontal ? "Horizontal" : "Vertical"} · {ETIQUETA_ESTADO[estado]}
          {imagenes.length > 0 && ` · ${imagenes.length} ${imagenes.length === 1 ? "hoja" : "hojas"}`}
        </p>
        {avisoPrevia && <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{avisoPrevia}</div>}
        <div className="-mx-5 space-y-4 bg-slate-100 px-5 py-5">
          {imagenes.map((src, i) => (
            <figure key={i} className={`mx-auto ${horizontal ? "max-w-3xl" : "max-w-xl"}`}>
              <img src={src} alt={`Hoja ${i + 1} del reporte`} className="w-full border border-slate-300 bg-white shadow-md" />
              <figcaption className="mt-1.5 text-center text-[11px] text-slate-500">
                Hoja {i + 1} de {imagenes.length}
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">
          El Excel usa la misma configuración y queda listo para imprimir en {hoja.etiqueta}; el ancho de las columnas puede variar un poco según el programa.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title="Reporte de materias"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={generarVistaPrevia}
            disabled={generando}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {generando ? "Generando…" : "Generar vista previa"}
          </button>
        </>
      }
    >
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-600">Tamaño de hoja</p>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(PAPELES).map(([key, p]) => {
            const activo = papel === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPapel(key)}
                aria-pressed={activo}
                className={`rounded border px-3 py-2.5 text-left text-sm transition ${
                  activo ? "border-slate-900 text-slate-900 ring-1 ring-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-400"
                }`}
              >
                <span className={`block ${activo ? "font-semibold" : ""}`}>{p.etiqueta}</span>
                <span className="block text-xs text-slate-500">{p.ancho} × {p.alto} pulgadas</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-600">Orientación</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: "vertical", label: "Vertical" },
            { key: "horizontal", label: "Horizontal" },
          ].map((op) => {
            const activo = orientacion === op.key;
            return (
              <button
                key={op.key}
                type="button"
                onClick={() => setOrientacion(op.key)}
                aria-pressed={activo}
                className={`flex h-20 items-center justify-center gap-3 rounded border text-sm transition ${
                  activo ? "border-slate-900 text-slate-900 ring-1 ring-slate-900" : "border-slate-200 text-slate-400 hover:border-slate-400"
                }`}
              >
                <IconoHoja horizontal={op.key === "horizontal"} />
                <span className={activo ? "font-semibold" : "text-slate-600"}>{op.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-600">Materias a incluir</label>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
          {Object.entries(ETIQUETA_ESTADO).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-600">Columnas adicionales</p>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={incluirDescripcion} onChange={(e) => setIncluirDescripcion(e.target.checked)} />
          Descripción
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={incluirUso} onChange={(e) => setIncluirUso(e.target.checked)} />
          Uso: cantidad de actividades y días de asistencia registrados
        </label>
      </div>
    </Modal>
  );
}
