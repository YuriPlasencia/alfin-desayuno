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

  // Constancias de billetera o banco (Yape, Plin, transferencias)
  const voucher = parseVoucher(text)
  if (voucher.wallet && voucher.amount) detectedAmount = voucher.amount

  return {
    detectedAmount,
    detectedConcept,
    allPrices: allPrices.slice(0, 6),
    rawText: text.slice(0, 2000),
    wallet: voucher.wallet,
    operationCode: voucher.operationCode,
    paidAt: voucher.paidAt,
  }
}

const WALLETS = [
  ['Yape', /\byape(aste|ado)?\b/i],
  ['Plin', /\bplin\b/i],
  ['BCP', /\bbcp\b/i],
  ['Interbank', /\binterbank\b/i],
  ['BBVA', /\bbbva\b/i],
  ['Scotiabank', /\bscotiabank\b/i],
]

const MONTHS = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, set: 9, sep: 9, oct: 10, nov: 11, dic: 12 }

/** Lee lo típico de una constancia: billetera, monto principal, n.° de operación y fecha. */
export function parseVoucher(text) {
  const wallet = WALLETS.find(([, pattern]) => pattern.test(text))?.[0] || ''

  // En Yape/Plin el monto grande aparece primero, con "S/".
  const first = text.match(/s\s*\/\s*\.?\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/i)
  const amount = first ? parseFloat(first[1].replace(',', '.')) : null

  const op = text.match(/(?:operaci[oó]n|n[°º.ro]*\s*de\s*operaci[oó]n|c[oó]digo|transacci[oó]n)\s*[:#n°º.]*\s*([0-9]{5,14})/i)
  const operationCode = op ? op[1] : ''

  let paidAt = ''
  const dm = text.match(/\b([0-3]?[0-9])\s*(?:de\s*)?(ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic)[a-z.]*\s*(?:de\s*)?(20[0-9]{2})/i)
  const dn = text.match(/\b([0-3]?[0-9])[/-]([01]?[0-9])[/-](20[0-9]{2})\b/)
  if (dm) paidAt = iso(dm[3], MONTHS[dm[2].toLowerCase().slice(0, 3)], dm[1])
  else if (dn) paidAt = iso(dn[3], dn[2], dn[1])

  return { wallet, amount: amount && amount > 0 ? amount : null, operationCode, paidAt }
}

function iso(year, month, day) {
  const m = Number(month)
  const d = Number(day)
  if (!m || m > 12 || !d || d > 31) return ''
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
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
      wallet: '',
      operationCode: '',
      paidAt: '',
    }
  }
}
