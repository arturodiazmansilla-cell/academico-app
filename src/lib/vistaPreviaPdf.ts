/**
 * Convierte cada hoja de un PDF en una imagen PNG para mostrar la vista previa
 * antes de guardar. Usa pdf.js (el visor de PDF de Firefox), así que la imagen es
 * exactamente el mismo documento que se descarga.
 * La librería se carga solo cuando se pide una vista previa.
 */
export async function pdfAImagenes(pdf: ArrayBuffer, anchoPx = 1100): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  // @ts-ignore -- import de Vite que devuelve la URL del archivo del worker
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const documento = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise;
  try {
    const imagenes: string[] = [];
    for (let n = 1; n <= documento.numPages; n++) {
      const pagina = await documento.getPage(n);
      const escala = anchoPx / pagina.getViewport({ scale: 1 }).width;
      const viewport = pagina.getViewport({ scale: escala });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('El navegador no permite dibujar la vista previa.');
      await pagina.render({ canvasContext: ctx, viewport }).promise;
      imagenes.push(canvas.toDataURL('image/png'));
    }
    return imagenes;
  } finally {
    await documento.destroy();
  }
}
