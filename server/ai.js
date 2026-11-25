/*
 * Lectura de imágenes y PDF con Claude (Anthropic). Es la primera opción para leer boletas,
 * constancias y cotizaciones; el OCR (Tesseract, ver ocr.js) queda de respaldo.
 *
 * readWithClaude devuelve { data, usage }. data es null cuando hay que seguir con el OCR:
 * sin ANTHROPIC_API_KEY, Claude caído o lento, sin saldo, o si no pudo leer el documento.
 * Nunca lanza un error: quien llama solo revisa si data vino null.
 */

export const AI_ENABLED = Boolean(String(process.env.ANTHROPIC_API_KEY || '').trim())

const MODEL = 'claude-opus-5-5'
// Pasado este tiempo se abandona la lectura y sigue el OCR: nadie espera minutos por una boleta.
const TIMEOUT_MS = 40_000
// Tras varias fallas seguidas se deja de intentar un rato, para no hacer esperar a cada persona
// el tiempo máximo mientras Claude sigue caído.
const MAX_FAILURES = 2
const PAUSE_MS = 2 * 60_000

let client = null
let failures = 0
let pausedUntil = 0

/** true si ahora mismo se intentaría leer con Claude (hay clave y no está en pausa por fallas). */
export const aiAvailable = () => AI_ENABLED && Date.now() >= pausedUntil

function recordFailure(err) {
  failures += 1
  const status = err?.status ? ` (${err.status})` : ''
  console.error(`[ia] lectura con Claude falló${status}, sigue el OCR:`, err?.message || err)
  if (failures >= MAX_FAILURES) {
    pausedUntil = Date.now() + PAUSE_MS
    failures = 0
    console.error(`[ia] ${MAX_FAILURES} fallas seguidas: se usa solo el OCR por ${PAUSE_MS / 60_000} minutos.`)
  }
}

// Precio por millón de tokens (entrada, salida) en dólares, según el modelo que respondió.
const PRICES = [
  ['claude-haiku-5-5', 0.1, 0.5],
  ['claude-sonnet', 2, 10],
  ['claude-opus-5-5', 4, 20],
  ['claude-opus', 5, 25],
  ['claude-fable', 8, 40],
]

/** Costo estimado de una respuesta, en dólares. */
export function costOf(model, input, output) {
  const [, inPrice, outPrice] = PRICES.find(([prefix]) => String(model).startsWith(prefix)) || PRICES[2]
  return (input * inPrice + output * outPrice) / 1_000_000
}

function usageOf(response, started) {
  const u = response.usage || {}
  const input = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0)
  const output = u.output_tokens || 0
  const model = response.model || MODEL
  return { model, input, output, cost: costOf(model, input, output), ms: Date.now() - started, error: '' }
}

/**
 * Lee un documento y devuelve { data, usage }.
 * - data: los datos con la forma de `schema`, o null cuando hay que seguir con el OCR.
 * - usage: { model, input, output, cost, ms, error } de la llamada a Claude; null si no se intentó
 *   (sin clave o en pausa). Sirve para registrar el consumo aunque la lectura no haya servido.
 * Parámetros:
 * - mime/base64: la imagen (jpeg, png, webp) o el PDF.
 * - instructions: qué es el documento y qué devolver en cada campo.
 * - schema: función que recibe `z` (zod) y devuelve el esquema de la respuesta.
 */
export async function readWithClaude({ mime, base64, instructions, schema, maxTokens = 16000 }) {
  if (!aiAvailable()) return { data: null, usage: null }
  const started = Date.now()
  try {
    const [{ default: Anthropic }, { betaZodOutputFormat }, { z }] = await Promise.all([
      import('@anthropic-ai/sdk'),
      import('@anthropic-ai/sdk/helpers/beta/zod'),
      import('zod'),
    ])
    client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 })
    const source =
      mime === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
        : { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } }
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: maxTokens,
      // Si el modelo rechaza la lectura, la API reintenta sola con otro modelo.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(schema(z)) },
      messages: [{ role: 'user', content: [source, { type: 'text', text: instructions }] }],
    })
    // Respondió: Claude está en pie, aunque este documento no se haya podido leer.
    failures = 0
    const usage = usageOf(response, started)
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens' || !response.parsed_output) {
      console.error(`[ia] Claude no devolvió una lectura (${response.stop_reason}), sigue el OCR.`)
      return { data: null, usage: { ...usage, error: String(response.stop_reason || 'sin lectura') } }
    }
    return { data: response.parsed_output, usage }
  } catch (err) {
    recordFailure(err)
    return { data: null, usage: { model: MODEL, input: 0, output: 0, cost: 0, ms: Date.now() - started, error: err?.status ? `error ${err.status}` : 'sin conexión' } }
  }
}
