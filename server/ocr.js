import { createWorker } from 'tesseract.js'

let workerInstance = null
let workerPromise = null

async function getWorker() {
  if (workerInstance) return workerInstance
  if (!workerPromise) {
    workerPromise = (async () => {
      try {
        const w = await createWorker('spa+eng')
        workerInstance = w
        return w
      } catch (err) {
        console.error('[OCR] Error initializing Tesseract worker:', err)
        workerPromise = null
        throw err
      }
    })()
  }
  return workerPromise
}

export function parseQuoteText(text) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  let detectedAmount = null
  let allPrices = []

  // Check lines with TOTAL (highest confidence)
  for (const line of lines) {
    if (/\btotal\b/i.test(line) && !/\bsubtotal\b/i.test(line)) {
      const mAll = [...line.matchAll(/([0-9]{1,4}[.,][0-9]{2})/g)]
      if (mAll.length > 0) {
        detectedAmount = parseFloat(mAll[mAll.length - 1][1].replace(',', '.'))
        break
      }
      const mInt = line.match(/(?:s\/?\.?|soles|pen|\$)?\s*([0-9]{1,5})\b/i)
      if (mInt && parseFloat(mInt[1]) > 0) {
        detectedAmount = parseFloat(mInt[1])
        break
      }
    }
  }

  // Second pass: lines with IMPORTE, PRECIO, MONTO, NETO
  if (!detectedAmount) {
    for (const line of lines) {
      if (/\b(importe|monto|neto|pagar|venta|precio|cotizacion|cotización)\b/i.test(line)) {
        const mAll = [...line.matchAll(/([0-9]{1,4}[.,][0-9]{2})/g)]
        if (mAll.length > 0) {
          detectedAmount = parseFloat(mAll[mAll.length - 1][1].replace(',', '.'))
          break
        }
      }
    }
  }

  // Find all number patterns with decimals or currency
  const priceMatches = text.matchAll(/(?:s\/?\.?|soles|pen|\$)?\s*([0-9]{1,4}[.,][0-9]{2})/gi)
  for (const m of priceMatches) {
    const v = parseFloat(m[1].replace(',', '.'))
    if (v > 0 && !allPrices.includes(v)) allPrices.push(v)
  }

  // Fallback: look for integer prices if no decimals (e.g. S/ 350, S/. 80, 120 soles)
  const intMatches = text.matchAll(/(?:s\/?\.?|soles|pen|\$)\s*([0-9]{2,5})\b/gi)
  for (const m of intMatches) {
    const v = parseFloat(m[1])
    if (v > 0 && !allPrices.includes(v)) allPrices.push(v)
  }

  // If no explicit total found, take the largest price
  if (!detectedAmount && allPrices.length > 0) {
    detectedAmount = Math.max(...allPrices)
  }

  // Concept: look for first line that looks like a business name or product
  let detectedConcept = ''
  for (const line of lines) {
    if (
      line.length > 3 &&
      !/^[0-9\s.,:\/-]+$/.test(line) &&
      !/^(total|subtotal|ruc|fecha|hora|igv|boleta|factura|dni|telefono|tel|cel|mesa|serie|numero)/i.test(line)
    ) {
      detectedConcept = line.slice(0, 60).trim()
      break
    }
  }

  return {
    detectedAmount,
    detectedConcept,
    allPrices: allPrices.slice(0, 6),
    rawText: text.slice(0, 2000),
  }
}

export async function scrapeQuoteImage(imageBufferOrDataUrl) {
  try {
    const worker = await getWorker()
    let input = imageBufferOrDataUrl
    if (typeof imageBufferOrDataUrl === 'string' && imageBufferOrDataUrl.startsWith('data:')) {
      const base64Data = imageBufferOrDataUrl.replace(/^data:image\/\w+;base64,/, '')
      input = Buffer.from(base64Data, 'base64')
    }

    const {
      data: { text },
    } = await worker.recognize(input)

    const parsed = parseQuoteText(text || '')
    return { ok: true, ...parsed }
  } catch (error) {
    console.error('[OCR] scrapeQuoteImage failed:', error)
    return {
      ok: false,
      error: error.message || 'No se pudo procesar la imagen',
      detectedAmount: null,
      detectedConcept: '',
      allPrices: [],
      rawText: '',
    }
  }
}
