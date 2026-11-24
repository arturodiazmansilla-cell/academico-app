// Reporte de Calificación en dos pasos, igual que ReporteMateriasModal:
//  1) configurar -> tamaño de hoja (Carta u Oficio). Siempre sale en horizontal.
//  2) vista previa -> imagen de cada hoja del PDF ya generado; desde ahí se descarga
//                     el PDF o el Excel con la misma configuración.
//
// `obtenerDatos` lo pasa Notas.tsx: arma el objeto `datos` (mismos promedios y totales
// que ya están en pantalla) en el momento de generar la vista previa, para que el reporte
// siempre salga con las notas más recientes.

import { useRef, useState } from "react";
import { FileSpreadsheet, FileText, ArrowLeft, RectangleHorizontal, RectangleVertical } from "lucide-react";
import { Modal } from "./ui";
import { NOMBRE_ARCHIVO, PAPELES } from "../lib/reporteCalificaciones";

export default function ReporteCalificacionModal({ obtenerDatos, logoUrl, onClose }) {
  const [paso, setPaso] = useState("configurar");
  const [papel, setPapel] = useState("carta");
  const [orientacion, setOrientacion] = useState("horizontal");
  const [unaHoja, setUnaHoja] = useState(false);

  const [generando, setGenerando] = useState(false);
  const [imagenes, setImagenes] = useState([]);
  const [error, setError] = useState("");
  const [avisoPrevia, setAvisoPrevia] = useState("");
  const [descargando, setDescargando] = useState("");

  // Lo generado en el paso 1, para descargar exactamente lo que se ve en la vista previa.
  const generado = useRef(null);

  async function generarVistaPrevia() {
    if (generando) return;
    setGenerando(true);
    setError("");
    setAvisoPrevia("");
    try {
      const datos = await obtenerDatos();
      const { crearPdfCalificacion } = await import("../lib/reporteCalificaciones");
      const doc = await crearPdfCalificacion(papel, datos, logoUrl, { unaHoja, orientacion });
      generado.current = { datos, papel, orientacion, doc, unaHoja };

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

  function descargarPdf() {
    generado.current?.doc.save(`${NOMBRE_ARCHIVO}.pdf`);
  }

  async function descargarXls() {
    if (!generado.current || descargando) return;
    setDescargando("xls");
    try {
      const { descargarReporte } = await import("../lib/reporteCalificaciones");
      await descargarReporte("xls", generado.current.papel, generado.current.datos, logoUrl, {
        unaHoja: generado.current.unaHoja,
        orientacion: generado.current.orientacion,
      });
    } catch (e) {
      alert("No se pudo generar el Excel: " + (e?.message || "error desconocido"));
    } finally {
      setDescargando("");
    }
  }

  if (paso === "previa") {
    const hoja = PAPELES[generado.current?.papel] ?? PAPELES.carta;
    return (
      <Modal
        title="Vista previa · Reporte de Calificación"
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
          {hoja.nombre} · {generado.current?.orientacion === "vertical" ? "Vertical" : "Horizontal"}
          {generado.current?.unaHoja && " · Ajustado a una sola hoja"}
          {imagenes.length > 0 && ` · ${imagenes.length} ${imagenes.length === 1 ? "hoja" : "hojas"}`}
        </p>
        {avisoPrevia && <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{avisoPrevia}</div>}
        <div className="-mx-5 space-y-4 bg-slate-100 px-5 py-5">
          {imagenes.map((src, i) => (
            <figure key={i} className="mx-auto max-w-3xl">
              <img src={src} alt={`Hoja ${i + 1} del reporte`} className="w-full border border-slate-300 bg-white shadow-md" />
              <figcaption className="mt-1.5 text-center text-[11px] text-slate-500">
                Hoja {i + 1} de {imagenes.length}
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">
          El Excel usa la misma configuración y queda listo para imprimir en {hoja.nombre}; el ancho de las columnas puede variar un poco según el programa.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title="Reporte de Calificación"
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
                <span className={`block ${activo ? "font-semibold" : ""}`}>{p.nombre}</span>
                <span className="block text-xs text-slate-500">{Math.round(p.ancho)} × {Math.round(p.alto)} mm</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-600">Orientación</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: "horizontal", texto: "Horizontal", Icono: RectangleHorizontal },
            { key: "vertical", texto: "Vertical", Icono: RectangleVertical },
          ].map(({ key, texto, Icono }) => {
            const activo = orientacion === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setOrientacion(key)}
                aria-pressed={activo}
                className={`flex items-center gap-2 rounded border px-3 py-2.5 text-left text-sm transition ${
                  activo ? "border-slate-900 text-slate-900 ring-1 ring-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-400"
                }`}
              >
                <Icono className="h-4 w-4 shrink-0" />
                <span className={activo ? "font-semibold" : ""}>{texto}</span>
              </button>
            );
          })}
        </div>
        {orientacion === "vertical" && (
          <p className="mt-1.5 text-xs text-amber-700">
            Con varias actividades, las columnas pueden quedar muy angostas en vertical. Si no se lee bien, prueba Horizontal.
          </p>
        )}
      </div>

      <label className="flex items-start gap-2 rounded border border-slate-200 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
        <input
          type="checkbox"
          checked={unaHoja}
          onChange={(e) => setUnaHoja(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
        />
        <span>
          <span className="block font-medium">Ajustar a una sola hoja</span>
          <span className="block text-xs text-slate-500">
            Reduce la letra y el alto de las filas para que quepan todos los alumnos en una sola página, sin importar cuántos sean.
          </span>
        </span>
      </label>
    </Modal>
  );
}
