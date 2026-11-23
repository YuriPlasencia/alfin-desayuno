// Lectura de PDF en el navegador (pdf.js se carga solo cuando hace falta).

async function loadPdf(file: File) {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
}

/**
 * Texto de un PDF digital (hasta 3 páginas), armado por renglones según su altura en la página.
 * Si el PDF es una foto escaneada, `text` sale vacío y se usa `image` (la primera página).
 */
export async function readPdf(file: File): Promise<{ text: string; image: string }> {
  const doc = await loadPdf(file)
  const rows: string[] = []
  for (let n = 1; n <= Math.min(doc.numPages, 3); n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    const byLine = new Map<number, { x: number; text: string }[]>()
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const y = Math.round(item.transform[5] / 3) // tolera pequeñas diferencias de altura
      const list = byLine.get(y) || []
      list.push({ x: item.transform[4], text: item.str })
      byLine.set(y, list)
    }
    for (const y of [...byLine.keys()].sort((a, b) => b - a)) {
      rows.push(
        byLine
          .get(y)!
          .sort((a, b) => a.x - b.x)
          .map((part) => part.text)
          .join(' '),
      )
    }
  }
  const text = rows.join('\n')
  if (text.trim().length >= 20) return { text, image: '' }

  // Escaneado: se dibuja la primera página para leerla con OCR.
  const page = await doc.getPage(1)
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = Math.min(2400, viewport.width)
  canvas.height = Math.round((viewport.height * canvas.width) / viewport.width)
  await page.render({ canvas, viewport: page.getViewport({ scale: (2 * canvas.width) / viewport.width }) }).promise
  return { text: '', image: canvas.toDataURL('image/jpeg', 0.85) }
}

/** El archivo tal cual, como data URL (para guardarlo junto al movimiento). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsDataURL(file)
  })
}
