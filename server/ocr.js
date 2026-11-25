import { createWorker } from 'tesseract.js'
import { readWithClaude } from './ai.js'

let workerInstance = null
let workerPromise = null

async function getWorker() {
  if (workerInstance) return workerInstance
  if (!workerPromise) {
    workerPromise = (async () => {
      try {
        // Sin errorHandler, tesseract.js relanza el error de un trabajo fallido fuera de la promesa
        // y tumba el proceso entero (que atiende a todos los eventos).
        const w = await createWorker('spa+eng', undefined, {
          errorHandler: (err) => console.error('[OCR] Trabajo rechazado:', err),
        })
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

  // Constancias de billetera o banco (Yape, Plin, transferencias)
  const voucher = parseVoucher(text)

  // Concepto: primera línea con aspecto de comercio o producto. En una constancia
  // de billetera no hay comercio: la app arma el concepto ("Cuota de …").
  let detectedConcept = ''
  for (const line of voucher.wallet ? [] : lines) {
    if (
      line.length > 3 &&
      !/^[0-9\s.,:\/-]+$/.test(line) &&
      !/^(total|subtotal|ruc|fecha|hora|igv|boleta|factura|dni|telefono|tel|cel|mesa|serie|numero)/i.test(line) &&
      !isStatusBar(line)
    ) {
      detectedConcept = line.slice(0, 60).trim()
      break
    }
  }
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

/** Barra de estado de una captura de pantalla (operador, hora, señal, batería) o ruido del OCR. */
function isStatusBar(line) {
  if (/\b(claro|movistar|entel|bitel|4g|5g|lte|volte|wi-?fi)\b/i.test(line)) return true
  if (/\b[0-2]?[0-9]:[0-5][0-9]\b/.test(line) && line.length < 40) return true
  if (/%/.test(line)) return true
  const letters = (line.match(/[a-záéíóúñ]/gi) || []).length
  return letters / line.length < 0.6
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

// Un solo motor para todos los eventos: pocos trabajos en cola y cada uno con tiempo máximo.
const MAX_QUEUE = 4
const JOB_TIMEOUT_MS = 45_000
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([a-z0-9+/=]+)$/i
let pending = 0

/** Reinicia el motor si un trabajo se colgó, para que el siguiente no espere detrás. */
async function resetWorker() {
  const w = workerInstance
  workerInstance = null
  workerPromise = null
  if (w) await w.terminate().catch(() => {})
}

function withTimeout(promise) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), JOB_TIMEOUT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Texto de una imagen en data URL (jpeg, png o webp). Nunca una dirección ni una ruta de archivo.
 * Devuelve { text } o { error } con un mensaje para mostrar.
 */
export async function recognizeText(dataUrl) {
  const match = typeof dataUrl === 'string' ? DATA_URL.exec(dataUrl) : null
  if (!match) return { error: 'La imagen no tiene un formato válido' }
  if (pending >= MAX_QUEUE) return { error: 'Hay muchas imágenes en lectura. Prueba en unos segundos.' }
  pending += 1
  try {
    const worker = await getWorker()
    const {
      data: { text },
    } = await withTimeout(worker.recognize(Buffer.from(match[2], 'base64')))
    return { text: text || '' }
  } catch (error) {
    console.error('[OCR] recognizeText failed:', error)
    if (error?.message === 'timeout') await resetWorker()
    return { error: 'No se pudo leer la imagen' }
  } finally {
    pending -= 1
  }
}

const QUOTE_INSTRUCTIONS = `Es la foto de una constancia de pago (Yape, Plin o transferencia bancaria) o de una cotización, proforma o boleta (Perú). Devuelve:
- amount: el monto principal en soles (el pagado en una constancia, el total en una cotización o boleta); 0 si no aparece.
- concept: en una cotización o boleta, el producto, servicio o proveedor en pocas palabras; en una constancia, el nombre de quien recibe el pago; '' si no se distingue.
- prices: hasta 6 montos en soles que aparecen en la imagen, el principal primero, sin repetir.
- wallet: la billetera o banco de la constancia; '' si no es una constancia o no se distingue.
- operationCode: el número de operación, solo dígitos; '' si no aparece.
- paidAt: la fecha del pago en formato AAAA-MM-DD; '' si no aparece.
- text: todo el texto legible de la imagen, tal como figura, con saltos de línea.
No inventes datos: lo que no se lee va vacío.`

const WALLET_NAMES = ['', ...WALLETS.map(([name]) => name), 'Otro']

/** Lectura con Claude: { read, usage }. read tiene la forma de la del OCR, o es null si hay que seguir con el OCR. */
async function scrapeWithClaude(dataUrl) {
  const match = DATA_URL.exec(dataUrl)
  if (!match) return { read: null, usage: null }
  const { data: read, usage } = await readWithClaude({
    mime: `image/${match[1].toLowerCase()}`,
    base64: match[2],
    instructions: QUOTE_INSTRUCTIONS,
    maxTokens: 4000,
    schema: (z) =>
      z.object({
        amount: z.number(),
        concept: z.string(),
        prices: z.array(z.number()),
        wallet: z.enum(WALLET_NAMES),
        operationCode: z.string(),
        paidAt: z.string(),
        text: z.string(),
      }),
  })
  if (!read) return { read: null, usage }
  const money = (value) => (Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null)
  const amount = money(read.amount)
  const prices = Array.from(new Set([amount, ...read.prices.map(money)].filter((value) => value !== null))).slice(0, 6)
  // Sin monto ni texto, Claude no vio nada útil: que lo intente el OCR.
  if (amount === null && !prices.length && !read.text.trim()) return { read: null, usage: { ...usage, error: 'sin datos' } }
  const result = {
    detectedAmount: amount,
    detectedConcept: read.concept.trim().slice(0, 120),
    allPrices: prices,
    rawText: read.text.slice(0, 2000),
    wallet: read.wallet === 'Otro' ? '' : read.wallet,
    operationCode: read.operationCode.replace(/\D/g, '').slice(0, 14),
    paidAt: /^20\d{2}-\d{2}-\d{2}$/.test(read.paidAt) ? read.paidAt : '',
  }
  return { read: result, usage }
}

/**
 * Lee una constancia o cotización: primero con Claude; si no hay clave, Claude está caído
 * o no pudo leerla, con el OCR. `source` dice cuál de los dos dio la lectura.
 * Con `ai: false` va directo al OCR. `usage` es el consumo de la llamada a Claude (null si no hubo):
 * es para registrarlo, no para enviarlo al navegador.
 */
export async function scrapeQuoteImage(dataUrl, { ai = true } = {}) {
  const { read, usage } = ai ? await scrapeWithClaude(dataUrl) : { read: null, usage: null }
  if (read) return { ok: true, source: 'ia', ...read, usage }
  const result = await recognizeText(dataUrl)
  if (result.error) return { ...failed(result.error), usage }
  return { ok: true, source: 'ocr', ...parseQuoteText(result.text), usage }
}

function failed(message) {
  return {
    ok: false,
    error: message,
    detectedAmount: null,
    detectedConcept: '',
    allPrices: [],
    rawText: '',
    wallet: '',
    operationCode: '',
    paidAt: '',
  }
}
