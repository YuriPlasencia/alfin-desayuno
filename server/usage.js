import { nowIso } from './db.js'
import { AI_ENABLED } from './ai.js'
import { pdb } from './platform.js'

/*
 * Registro de lecturas de boletas, constancias y cotizaciones: quién la pidió, quién la leyó
 * (Claude o el OCR), cuántos tokens consumió y cuánto costó. De aquí salen el consumo del panel
 * /admin y la cuenta de lecturas gratis de cada persona.
 *
 * El nombre y el correo se copian en cada fila: así el registro sigue completo aunque la
 * cuenta cambie de nombre o se borre.
 */

/** Lecturas con Claude que cada persona tiene gratis, en total (no por mes). */
export const FREE_READS = 500

pdb.exec(`
  CREATE TABLE IF NOT EXISTS ai_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_name TEXT NOT NULL DEFAULT '',
    user_email TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    ms INTEGER NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS ai_reads_at ON ai_reads (at);
  CREATE INDEX IF NOT EXISTS ai_reads_user ON ai_reads (user_id, source);
`)

/**
 * Guarda una lectura.
 * - kind: 'evento' (constancia o cotización de un evento), 'gasto' o 'ingreso' (Mis finanzas).
 * - source: 'ia' (leyó Claude), 'ocr' (leyó el respaldo) o 'sin lectura' (ninguno pudo).
 * - usage: lo que devolvió readWithClaude; null si no se llamó a Claude.
 * Los tokens se guardan aunque al final haya leído el OCR: esa llamada a Claude también se cobra.
 */
export function recordRead({ user, kind, slug = '', source, usage = null }) {
  try {
    pdb
      .prepare(
        `INSERT INTO ai_reads (at, user_id, user_name, user_email, kind, slug, source, model, input_tokens, output_tokens, cost_usd, ms, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        nowIso(),
        user?.id ?? null,
        String(user?.name || '').slice(0, 120),
        String(user?.email || '').slice(0, 254),
        kind,
        slug,
        source,
        usage?.model || '',
        usage?.input || 0,
        usage?.output || 0,
        usage?.cost || 0,
        usage?.ms || 0,
        String(usage?.error || '').slice(0, 120),
      )
  } catch (err) {
    // Que falle el registro nunca debe impedir la lectura.
    console.error('[consumo] no se pudo guardar la lectura:', err)
  }
}

/** Cuántas lecturas con Claude lleva una persona, en total. */
export function readsUsed(userId) {
  return pdb.prepare("SELECT COUNT(*) AS n FROM ai_reads WHERE user_id = ? AND source = 'ia'").get(userId).n
}

const DAY = "substr(datetime(at, '-5 hours'), 1, 10)"
const dayOfIso = (iso) => new Date(new Date(iso).getTime() - 5 * 3600000).toISOString().slice(0, 10)
const KIND = { evento: 'Constancias y cotizaciones', gasto: 'Boletas de compra', ingreso: 'Boletas de pago' }

/** Todo lo que muestra el panel sobre lecturas y consumo, para los últimos `days` días. */
export function usageSummary(days) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const one = (sql, ...args) => pdb.prepare(sql).get(...args)
  const all = (sql, ...args) => pdb.prepare(sql).all(...args)
  const SUMS = `COUNT(*) reads,
    COALESCE(SUM(source = 'ia'), 0) ia,
    COALESCE(SUM(source = 'ocr'), 0) ocr,
    COALESCE(SUM(source NOT IN ('ia', 'ocr')), 0) failed,
    COALESCE(SUM(input_tokens), 0) input,
    COALESCE(SUM(output_tokens), 0) output,
    COALESCE(SUM(cost_usd), 0) cost`

  const totals = one(`SELECT ${SUMS}, COALESCE(AVG(CASE WHEN source = 'ia' THEN ms END), 0) avgMs FROM ai_reads WHERE at >= ?`, since)
  const lifetime = one(`SELECT ${SUMS}, MIN(at) since FROM ai_reads`)
  // Llamadas a Claude que no sirvieron (caída, rechazo, sin saldo) y por eso leyó el OCR.
  const claudeErrors = all(
    `SELECT error label, COUNT(*) n FROM ai_reads WHERE at >= ? AND error <> '' GROUP BY error ORDER BY n DESC LIMIT 8`,
    since,
  )

  const byDay = new Map(all(`SELECT ${DAY} d, ${SUMS} FROM ai_reads WHERE at >= ? GROUP BY d`, since).map((r) => [r.d, r]))
  const daily = []
  for (let i = days - 1; i >= 0; i--) {
    const d = dayOfIso(new Date(Date.now() - i * 86400000).toISOString())
    const r = byDay.get(d)
    daily.push({ day: d, ia: r?.ia || 0, ocr: (r?.ocr || 0) + (r?.failed || 0), tokens: (r?.input || 0) + (r?.output || 0), cost: r?.cost || 0 })
  }

  const kinds = all(`SELECT kind, ${SUMS} FROM ai_reads WHERE at >= ? GROUP BY kind ORDER BY reads DESC`, since).map((r) => ({
    label: KIND[r.kind] || r.kind,
    reads: r.reads,
    ia: r.ia,
    cost: r.cost,
  }))

  // Por persona: el nombre y el correo actuales de la cuenta; si se borró, los copiados en la lectura.
  const users = all(
    `SELECT r.user_id id,
            COALESCE(NULLIF(u.name, ''), MAX(r.user_name)) name,
            COALESCE(NULLIF(u.email, ''), MAX(r.user_email)) email,
            COUNT(*) reads,
            COALESCE(SUM(r.kind = 'evento'), 0) proofs,
            COALESCE(SUM(r.kind IN ('gasto', 'ingreso')), 0) receipts,
            COALESCE(SUM(r.source = 'ia'), 0) ia,
            COALESCE(SUM(CASE WHEN r.at >= ? THEN 1 ELSE 0 END), 0) recent,
            COALESCE(SUM(r.input_tokens + r.output_tokens), 0) tokens,
            COALESCE(SUM(r.cost_usd), 0) cost,
            MAX(r.at) last
       FROM ai_reads r LEFT JOIN users u ON u.id = r.user_id
      GROUP BY COALESCE(r.user_id, -r.id)
      ORDER BY reads DESC, ia DESC LIMIT 200`,
    since,
  ).map((u) => ({ ...u, left: Math.max(0, FREE_READS - u.ia), over: Math.max(0, u.ia - FREE_READS) }))

  return {
    enabled: AI_ENABLED,
    free: FREE_READS,
    totals,
    lifetime,
    claudeErrors,
    daily,
    kinds,
    users,
    overLimit: users.filter((u) => u.over > 0).length,
  }
}

/** Todas las lecturas, para descargar. */
export function readRows() {
  return pdb
    .prepare(
      `SELECT r.at, COALESCE(NULLIF(u.name, ''), r.user_name) name, COALESCE(NULLIF(u.email, ''), r.user_email) email,
              r.kind, r.slug, r.source, r.model, r.input_tokens, r.output_tokens, r.cost_usd, r.ms, r.error
         FROM ai_reads r LEFT JOIN users u ON u.id = r.user_id ORDER BY r.id ASC`,
    )
    .all()
}
