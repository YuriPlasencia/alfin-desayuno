import { nowIso } from './db.js'
import { pdb } from './platform.js'
import { recognizeText } from './ocr.js'

/*
 * Finanzas personales: ingresos, gastos e inversiones de cada cuenta (no de un evento).
 * Una boleta (foto, PNG, JPEG, WEBP o PDF) se lee y llena las líneas: con IA si hay
 * ANTHROPIC_API_KEY; si no, con el OCR gratuito (Tesseract) y reglas.
 */

export const GASTO_CATEGORIAS = [
  'Supermercado',
  'Restaurantes y delivery',
  'Transporte',
  'Vivienda y servicios',
  'Salud',
  'Educación',
  'Entretenimiento',
  'Ropa y calzado',
  'Otros',
]
export const RUBROS = [
  'Abarrotes',
  'Carnes y pescados',
  'Frutas y verduras',
  'Lácteos y huevos',
  'Panadería y dulces',
  'Bebidas',
  'Limpieza del hogar',
  'Cuidado personal',
  'Bebés',
  'Mascotas',
  'Otros',
]
export const INGRESO_CATEGORIAS = ['Sueldo', 'Honorarios', 'Negocio', 'Alquileres', 'Otros']
// En una boleta de pago, cada línea suma (ingreso) o resta (descuento).
export const LINEAS_INGRESO = ['Ingreso', 'Descuento']
export const INVERSION_TIPOS = ['Depósito a plazo', 'Fondo mutuo', 'Acciones y ETF', 'AFP voluntario', 'Criptomonedas', 'Inmuebles', 'Otros']
const KINDS = ['ingreso', 'gasto', 'inversion']

pdb.exec(`
  CREATE TABLE IF NOT EXISTS fin_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mime TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS fin_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    date TEXT NOT NULL,
    concept TEXT NOT NULL DEFAULT '',
    merchant TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'Otros',
    amount REAL NOT NULL DEFAULT 0,
    current_value REAL,
    note TEXT NOT NULL DEFAULT '',
    doc_id INTEGER REFERENCES fin_docs(id) ON DELETE SET NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS fin_entries_user ON fin_entries (user_id, kind, date);
  CREATE TABLE IF NOT EXISTS fin_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL REFERENCES fin_entries(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    quantity REAL NOT NULL DEFAULT 1,
    amount REAL NOT NULL DEFAULT 0,
    rubro TEXT NOT NULL DEFAULT ''
  );
`)

// ---------- lectura de boletas sin IA (OCR + reglas) ----------

const plainText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

// Palabras que delatan el rubro de un producto de supermercado (en orden: la primera que calza gana).
const RUBRO_WORDS = [
  ['Bebés', ['panal', 'toallitas hum', 'formula infantil', 'babysec', 'huggies', 'pampers']],
  ['Mascotas', ['perro', 'gato', 'mascota', 'croqueta', 'ricocan', 'dog chow', 'cat chow', 'mimaskot']],
  ['Limpieza del hogar', ['detergente', 'lejia', 'suavizante', 'lavavajilla', 'desinfectante', 'limpiador', 'ambientador', 'esponja', 'bolsa basura', 'papel toalla', 'servilleta', 'quitagrasa', ' ace ', 'ariel', 'bolivar', 'opal', 'sapolio', 'clorox', 'poett']],
  ['Cuidado personal', ['shampoo', 'champu', 'acondicionador', 'pasta dental', 'dental', 'cepillo', 'desodorante', 'jabon', 'papel higien', 'toalla higien', 'afeitar', 'colonia', 'crema corporal', 'protector solar', 'colgate', 'dove', 'rexona', 'head & shoulders', 'elvive']],
  ['Lácteos y huevos', ['leche', 'yogur', 'yogurt', 'queso', 'mantequilla', 'margarina', 'huevo', 'crema de leche', 'gloria', 'laive', 'pura vida']],
  ['Carnes y pescados', ['pollo', 'carne', ' res', 'cerdo', 'chancho', 'pescado', 'jurel', 'bonito', 'salchicha', 'hot dog', 'jamon', 'embutido', 'pavo', 'chorizo', 'tocino', 'hamburguesa', 'filete', 'molida', 'pechuga', 'muslo', 'trucha', 'salmon', 'langostino']],
  ['Frutas y verduras', [' papa ', 'tomate', 'cebolla', 'limon', 'platano', 'manzana', 'palta', 'zanahoria', ' ajo ', 'lechuga', 'naranja', 'mandarina', 'fresa', ' uva', ' pera', 'pina', 'papaya', 'camote', 'choclo', 'zapallo', 'brocoli', 'pimiento', ' aji ', 'culantro', 'apio', 'pepino', 'melon', 'sandia', 'mango']],
  ['Panadería y dulces', [' pan ', 'pan frances', 'pan molde', 'galleta', 'chocolate', 'keke', 'torta', 'caramelo', 'mermelada', 'paneton', 'bizcocho', 'wafer', 'golosina', 'helado', 'cereal', 'bimbo']],
  ['Bebidas', ['agua', 'gaseosa', 'coca', 'inca kola', 'jugo', 'cerveza', 'vino', 'pisco', 'refresco', 'nectar', 'energizante', 'pilsen', 'cristal', 'cusquena', 'sprite', 'pepsi', 'frugos', 'cifrut', 'red bull', ' te ', 'cafe']],
  ['Abarrotes', ['arroz', 'azucar', 'aceite', 'fideo', 'tallarin', 'spaghetti', 'harina', 'atun', 'conserva', 'menestra', 'lenteja', 'frejol', 'garbanzo', ' sal ', 'avena', 'salsa', 'mayonesa', 'ketchup', 'mostaza', 'sopa', 'quinua', 'vinagre', 'sillao', 'condimento', 'comino', 'oregano', 'maicena', 'costeno', 'primor', 'don vittorio', 'molitalia', 'alacena']],
]
export function guessRubro(description) {
  const text = ` ${plainText(description)} `
  for (const [rubro, words] of RUBRO_WORDS) if (words.some((w) => text.includes(w))) return rubro
  return 'Otros'
}

const SUPERMARKETS = ['plaza vea', 'tottus', 'metro', 'wong', 'makro', 'mass', 'tambo', 'oxxo', 'vivanda', 'franco', 'precio uno', 'supermercado', 'minimarket', 'market', 'bodega']
const RESTAURANTS = ['restaurant', 'pollos', 'polleria', 'chifa', 'cafeteria', 'starbucks', 'kfc', 'bembos', 'pizza', 'burger', 'rappi', 'pedidosya', 'cevicheria', 'parrilla']
const PHARMACIES = ['inkafarma', 'mifarma', 'botica', 'farmacia', 'clinica']
const TRANSPORT = ['grifo', 'primax', 'repsol', 'petroperu', 'pecsa', 'uber', 'cabify', 'didi', 'peaje']

// Líneas de pie de boleta que no son productos.
const NOT_ITEM =
  /\b(?:sub ?total|total|igv|vuelto|efectivo|tarjeta|visa|mastercard|cambio|importe|ruc|pago|cajero|ticket|serie|icbper)\b|\b(?:op\.? ?grav|gravad|exonerad|inafect|redondeo|i\.g\.v|son:|bolsa plast|descuento total)/i
const MONEY = /(-?\d{1,6}(?:[.,]\d{3})*[.,]\d{2})(?:\s*[A-Z*])?\s*$/
const toNumber = (raw) => {
  const clean = String(raw).replace(/\s/g, '')
  // 1,234.50 o 1.234,50 → el último separador es el decimal.
  const decimal = clean.replace(/[.,](?=\d{3}(?:[.,]|$))/g, '').replace(',', '.')
  const value = Number(decimal)
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0
}

function findDate(text) {
  const m = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(text)
  if (!m) return ''
  const year = m[3].length === 2 ? `20${m[3]}` : m[3]
  const month = Number(m[2])
  const day = Number(m[1])
  if (!month || month > 12 || !day || day > 31) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function firstLines(lines) {
  return lines.find((l) => /[a-z]{3,}/i.test(l) && !/\b(ruc|boleta|factura|ticket|r\.u\.c)\b/i.test(l)) || ''
}

/** Boleta de compra → comercio, fecha, total y una línea por producto con su rubro. */
export function parseExpenseText(raw) {
  const lines = String(raw || '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const merchant = firstLines(lines).slice(0, 80)
  let total = 0
  const items = []
  for (const line of lines) {
    const money = MONEY.exec(line)
    if (!money) continue
    const amount = toNumber(money[1])
    if (/\btotal\b/i.test(line) && !/sub ?total/i.test(line)) {
      total = amount
      continue
    }
    if (NOT_ITEM.test(line)) continue
    let description = line.slice(0, money.index).trim()
    let quantity = 1
    const qty = /^(\d+(?:[.,]\d+)?)\s*(?:x|un|und|unid|kg|kgs)\b\.?\s*/i.exec(description) || /\b(\d+(?:[.,]\d+)?)\s*x\s*\d+[.,]\d{2}\s*$/i.exec(description)
    if (qty) {
      quantity = toNumber(qty[1].includes('.') || qty[1].includes(',') ? qty[1] : `${qty[1]}.00`) || 1
      description = description.replace(qty[0], ' ').trim()
    }
    description = description.replace(/^\d{5,}\s*/, '').replace(/\s{2,}/g, ' ').trim()
    if (!/[a-z]{2,}/i.test(description) || amount === 0) continue
    items.push({ description: description.slice(0, 120), quantity, amount, rubro: guessRubro(description) })
  }
  const sum = Math.round(items.reduce((acc, item) => acc + item.amount, 0) * 100) / 100
  const where = plainText(merchant)
  const category = SUPERMARKETS.some((w) => where.includes(w)) || items.length >= 4
    ? 'Supermercado'
    : RESTAURANTS.some((w) => where.includes(w))
      ? 'Restaurantes y delivery'
      : PHARMACIES.some((w) => where.includes(w))
        ? 'Salud'
        : TRANSPORT.some((w) => where.includes(w))
          ? 'Transporte'
          : 'Otros'
  return {
    merchant,
    date: findDate(lines.join(' ')),
    concept: category === 'Supermercado' ? `Compra en ${merchant || 'supermercado'}` : merchant,
    category,
    amount: total || sum,
    lines: category === 'Supermercado' ? items : items.map((item) => ({ ...item, rubro: '' })),
  }
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DISCOUNT = /\b(afp|onp|snp|essalud|descuento|dscto|renta|5ta|quinta|retencion|retenc|aporte|prima de seguro|comision|adelanto|prestamo|eps|sindicato|tardanza|inasistencia)\b/i

/** Boleta de pago → empleador, periodo, neto y una línea por concepto (ingreso o descuento). */
export function parseIncomeText(raw) {
  const lines = String(raw || '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const merchant = firstLines(lines).slice(0, 80)
  let net = 0
  let totalIn = 0
  let totalOut = 0
  const items = []
  for (const line of lines) {
    const money = MONEY.exec(line)
    if (!money) continue
    const amount = Math.abs(toNumber(money[1]))
    const text = plainText(line)
    if (/\bneto\b/.test(text)) {
      net = amount
      continue
    }
    if (/total/.test(text)) {
      if (/descuento|deduccion|retencion/.test(text)) totalOut = amount
      else if (/ingreso|remuneracion|haber/.test(text)) totalIn = amount
      continue
    }
    if (/\b(ruc|dni|codigo|cuspp|fecha|periodo)\b/.test(text) || amount === 0) continue
    const description = line.slice(0, money.index).replace(/^\d{3,}\s*/, '').trim()
    if (!/[a-z]{3,}/i.test(description)) continue
    const isDiscount = DISCOUNT.test(text)
    items.push({ description: description.slice(0, 120), quantity: 1, amount: isDiscount ? -amount : amount, rubro: isDiscount ? 'Descuento' : 'Ingreso' })
  }
  const sum = Math.round(items.reduce((acc, item) => acc + item.amount, 0) * 100) / 100
  const all = plainText(lines.join(' '))
  const month = MONTHS.find((m) => all.includes(m))
  return {
    merchant,
    date: findDate(lines.join(' ')),
    concept: month ? `Sueldo de ${month}` : 'Sueldo',
    category: 'Sueldo',
    amount: net || (totalIn ? Math.round((totalIn - totalOut) * 100) / 100 : sum),
    lines: items,
  }
}

// ---------- lectura con IA (Claude), apagada hasta tener ANTHROPIC_API_KEY ----------

export const AI_ENABLED = Boolean(String(process.env.ANTHROPIC_API_KEY || '').trim())
let aiClient = null

async function readWithClaude({ kind, mime, base64 }) {
  const [{ default: Anthropic }, { betaZodOutputFormat }, { z }] = await Promise.all([
    import('@anthropic-ai/sdk'),
    import('@anthropic-ai/sdk/helpers/beta/zod'),
    import('zod'),
  ])
  aiClient ??= new Anthropic()
  const lineTypes = kind === 'ingreso' ? LINEAS_INGRESO : RUBROS
  const Schema = z.object({
    merchant: z.string(),
    date: z.string(),
    concept: z.string(),
    category: z.enum(kind === 'ingreso' ? INGRESO_CATEGORIAS : GASTO_CATEGORIAS),
    amount: z.number(),
    lines: z.array(z.object({ description: z.string(), quantity: z.number(), amount: z.number(), rubro: z.enum(lineTypes) })),
  })
  const instructions =
    kind === 'ingreso'
      ? `Es una boleta de pago (Perú). Devuelve: merchant = empleador; date = fecha de pago o fin del periodo en formato AAAA-MM-DD ('' si no aparece); concept = "Sueldo de <mes>"; category; amount = neto a pagar en soles; lines = cada concepto con su monto, rubro "Ingreso" (remuneración, asignaciones, horas extra, bonos, gratificación) o "Descuento" (AFP, ONP, renta de 5ta, EsSalud a cargo del trabajador, préstamos), con los descuentos en negativo.`
      : `Es una boleta o comprobante de compra (Perú). Devuelve: merchant = comercio; date en formato AAAA-MM-DD ('' si no aparece); concept = descripción breve de la compra; category; amount = total pagado en soles; lines = un producto por línea tal como figura (description legible, quantity, amount = importe de la línea), con su rubro. Si no es supermercado, usa el rubro "Otros". No incluyas subtotales, IGV, redondeos ni medios de pago como líneas; los descuentos van como línea con monto negativo.`
  const source =
    mime === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } }
  const response = await aiClient.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(Schema) },
    messages: [{ role: 'user', content: [source, { type: 'text', text: instructions }] }],
  })
  if (response.stop_reason === 'refusal' || !response.parsed_output) return null
  return response.parsed_output
}

// ---------- API ----------

const DATA_URL = /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([a-z0-9+/=]+)$/i
const MAX_DOC_CHARS = 11_000_000 // ~8 MB de archivo
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100
const clampText = (value, max) => String(value ?? '').trim().slice(0, max)
const isoDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '')

function cleanLines(kind, lines) {
  const allowed = kind === 'ingreso' ? LINEAS_INGRESO : RUBROS
  return (Array.isArray(lines) ? lines : []).slice(0, 200).map((line, position) => ({
    position,
    description: clampText(line?.description, 160),
    quantity: Math.max(0, round2(line?.quantity ?? 1)) || 1,
    amount: round2(line?.amount),
    rubro: allowed.includes(line?.rubro) ? line.rubro : kind === 'gasto' ? guessRubro(line?.description) : 'Ingreso',
  }))
}

function cleanEntry(kind, body) {
  const categories = kind === 'ingreso' ? INGRESO_CATEGORIAS : kind === 'gasto' ? GASTO_CATEGORIAS : INVERSION_TIPOS
  return {
    date: isoDate(body?.date) || nowIso().slice(0, 10),
    concept: clampText(body?.concept, 120),
    merchant: clampText(body?.merchant, 120),
    category: categories.includes(body?.category) ? body.category : 'Otros',
    amount: Math.max(0, round2(body?.amount)),
    current_value: kind === 'inversion' && body?.current_value !== undefined && body?.current_value !== null && body?.current_value !== '' ? Math.max(0, round2(body.current_value)) : null,
    note: clampText(body?.note, 500),
  }
}

function linesOf(entryIds) {
  if (!entryIds.length) return new Map()
  const rows = pdb
    .prepare(`SELECT * FROM fin_lines WHERE entry_id IN (${entryIds.map(() => '?').join(',')}) ORDER BY entry_id, position`)
    .all(...entryIds)
  const map = new Map()
  for (const row of rows) {
    const list = map.get(row.entry_id) || []
    list.push({ description: row.description, quantity: row.quantity, amount: row.amount, rubro: row.rubro })
    map.set(row.entry_id, list)
  }
  return map
}

function saveLines(entryId, lines) {
  pdb.prepare('DELETE FROM fin_lines WHERE entry_id = ?').run(entryId)
  const insert = pdb.prepare('INSERT INTO fin_lines (entry_id, position, description, quantity, amount, rubro) VALUES (?, ?, ?, ?, ?, ?)')
  for (const line of lines) insert.run(entryId, line.position, line.description, line.quantity, line.amount, line.rubro)
}

const ownDoc = (userId, docId) => (docId ? pdb.prepare('SELECT id FROM fin_docs WHERE id = ? AND user_id = ?').get(Number(docId), userId) : null)

export function mountFinanzas(app, { requireUser, tooManyAttempts, failAttempt }) {
  // Movimientos de un periodo (las inversiones siempre todas: son la cartera).
  app.get('/api/finanzas', requireUser, (req, res) => {
    const month = /^\d{4}-\d{2}$/.test(String(req.query.mes || '')) ? String(req.query.mes) : nowIso().slice(0, 7)
    const rows = pdb
      .prepare(
        `SELECT id, kind, date, concept, merchant, category, amount, current_value, note, doc_id, source FROM fin_entries
         WHERE user_id = ? AND (kind = 'inversion' OR substr(date, 1, 7) = ?) ORDER BY date DESC, id DESC`,
      )
      .all(req.user.id, month)
    const lines = linesOf(rows.map((r) => r.id))
    const entries = rows.map((r) => ({ ...r, has_doc: Boolean(r.doc_id), lines: lines.get(r.id) || [] }))
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      month,
      entries,
      catalog: { gasto: GASTO_CATEGORIAS, rubros: RUBROS, ingreso: INGRESO_CATEGORIAS, lineasIngreso: LINEAS_INGRESO, inversion: INVERSION_TIPOS },
      ai: AI_ENABLED,
    })
  })

  app.post('/api/finanzas/entries', requireUser, (req, res) => {
    const kind = KINDS.includes(req.body?.kind) ? req.body.kind : null
    if (!kind) return res.status(400).json({ error: 'Elige ingreso, gasto o inversión' })
    const entry = cleanEntry(kind, req.body)
    if (!entry.concept && !entry.merchant) return res.status(400).json({ error: 'Escribe un concepto' })
    const docId = ownDoc(req.user.id, req.body?.doc_id)?.id ?? null
    const now = nowIso()
    const source = ['ocr', 'ia'].includes(req.body?.source) ? req.body.source : 'manual'
    const result = pdb
      .prepare(
        `INSERT INTO fin_entries (user_id, kind, date, concept, merchant, category, amount, current_value, note, doc_id, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(req.user.id, kind, entry.date, entry.concept, entry.merchant, entry.category, entry.amount, entry.current_value, entry.note, docId, source, now, now)
    const id = Number(result.lastInsertRowid)
    if (kind !== 'inversion') saveLines(id, cleanLines(kind, req.body?.lines))
    res.status(201).json({ id })
  })

  app.patch('/api/finanzas/entries/:id', requireUser, (req, res) => {
    const current = pdb.prepare('SELECT * FROM fin_entries WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id)
    if (!current) return res.status(404).json({ error: 'No encontrado' })
    const entry = cleanEntry(current.kind, { ...current, ...req.body })
    pdb
      .prepare('UPDATE fin_entries SET date = ?, concept = ?, merchant = ?, category = ?, amount = ?, current_value = ?, note = ?, updated_at = ? WHERE id = ?')
      .run(entry.date, entry.concept, entry.merchant, entry.category, entry.amount, entry.current_value, entry.note, nowIso(), current.id)
    if (current.kind !== 'inversion' && Array.isArray(req.body?.lines)) saveLines(current.id, cleanLines(current.kind, req.body.lines))
    res.json({ ok: true })
  })

  app.delete('/api/finanzas/entries/:id', requireUser, (req, res) => {
    const current = pdb.prepare('SELECT id, doc_id FROM fin_entries WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id)
    if (!current) return res.status(404).json({ error: 'No encontrado' })
    pdb.prepare('DELETE FROM fin_entries WHERE id = ?').run(current.id)
    if (current.doc_id) pdb.prepare('DELETE FROM fin_docs WHERE id = ? AND user_id = ?').run(current.doc_id, req.user.id)
    res.json({ ok: true })
  })

  // El archivo original de la boleta (solo su dueño).
  app.get('/api/finanzas/docs/:id', requireUser, (req, res) => {
    const doc = pdb.prepare('SELECT mime, data FROM fin_docs WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id)
    if (!doc) return res.status(404).json({ error: 'No encontrado' })
    res.setHeader('Cache-Control', 'private, no-store')
    res.json(doc)
  })

  /*
   * Lee una boleta y devuelve un borrador para revisar (no guarda el movimiento).
   * file: el archivo original (data URL de imagen o PDF), que se guarda para verlo después.
   * text: el texto de un PDF digital (lo saca el navegador); image: la primera página de un PDF escaneado.
   */
  app.post('/api/finanzas/scan', requireUser, async (req, res) => {
    const kind = req.body?.kind === 'ingreso' ? 'ingreso' : 'gasto'
    const key = `scan:${req.user.id}`
    if (tooManyAttempts(key, 30)) return res.status(429).json({ error: 'Leíste muchas boletas seguidas. Espera unos minutos.' })
    failAttempt(key)
    const file = typeof req.body?.file === 'string' ? req.body.file.trim() : ''
    const match = DATA_URL.exec(file)
    if (!match || file.length > MAX_DOC_CHARS) return res.status(400).json({ error: 'Sube una foto (JPG, PNG o WEBP) o un PDF de hasta 8 MB' })
    const mime = match[1].toLowerCase()

    // Borradores que nunca se guardaron: se limpian después de un día.
    pdb
      .prepare("DELETE FROM fin_docs WHERE user_id = ? AND created_at < ? AND id NOT IN (SELECT doc_id FROM fin_entries WHERE doc_id IS NOT NULL)")
      .run(req.user.id, new Date(Date.now() - 86_400_000).toISOString())
    const docId = Number(pdb.prepare('INSERT INTO fin_docs (user_id, mime, data, created_at) VALUES (?, ?, ?, ?)').run(req.user.id, mime, file, nowIso()).lastInsertRowid)

    let draft = null
    let source = 'ocr'
    let warning = ''
    if (AI_ENABLED) {
      try {
        const read = await readWithClaude({ kind, mime, base64: match[2] })
        if (read) {
          draft = { ...read, date: isoDate(read.date), lines: cleanLines(kind, read.lines) }
          source = 'ia'
        }
      } catch (err) {
        console.error('[finanzas] lectura con IA falló, sigo con OCR:', err?.message || err)
      }
    }
    if (!draft) {
      let text = typeof req.body?.text === 'string' ? req.body.text.slice(0, 50_000) : ''
      if (text.trim().length < 20) {
        const image = mime.startsWith('image/') ? file : typeof req.body?.image === 'string' ? req.body.image : ''
        const ocr = image ? await recognizeText(image) : { error: 'No se pudo leer el PDF. Prueba con una foto.' }
        if (ocr.error) return res.json({ doc_id: docId, source: 'manual', warning: ocr.error, draft: null })
        text = ocr.text
      }
      draft = kind === 'ingreso' ? parseIncomeText(text) : parseExpenseText(text)
      if (!draft.lines.length) warning = 'No se distinguieron las líneas. Revisa y complétalas a mano.'
    }
    res.json({ doc_id: docId, source, warning, draft })
  })
}
