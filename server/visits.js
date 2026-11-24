import crypto from 'node:crypto'
import { nowIso } from './db.js'
import { pdb } from './platform.js'

/*
 * Visitas a Juntay: cada vez que alguien abre una página, con o sin sesión.
 * Se identifica al navegador con una cookie al azar (juntay_v), no con la IP.
 * Cuando esa persona inicia sesión, sus visitas anteriores pasan a su cuenta:
 * así se ve el camino completo, de dónde llegó, cuándo se registró y qué hizo.
 */

pdb.exec(`
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    visitor TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    path TEXT NOT NULL DEFAULT '/',
    source TEXT NOT NULL DEFAULT '',
    medium TEXT NOT NULL DEFAULT '',
    campaign TEXT NOT NULL DEFAULT '',
    referrer TEXT NOT NULL DEFAULT '',
    device TEXT NOT NULL DEFAULT '',
    region TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS visits_at ON visits (at);
  CREATE INDEX IF NOT EXISTS visits_visitor ON visits (visitor, at);
  CREATE INDEX IF NOT EXISTS visits_user ON visits (user_id);
`)

export const VISITOR_COOKIE = 'juntay_v'
const VISITOR_DAYS = 400
const VISITOR_PATTERN = /^[a-f0-9]{32}$/
const MAX_PER_HOUR = 120
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|curl|wget|python|node-fetch|headless|lighthouse/i

// De dónde llegó, a partir de la página anterior (cuando no trae utm_source).
const SOURCES = [
  [/(^|\.)google\./, 'Google'],
  [/(^|\.)bing\.com$/, 'Bing'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, 'Facebook'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, 'WhatsApp'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'X'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'LinkedIn'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)t\.me$|(^|\.)telegram\.org$/, 'Telegram'],
  [/(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com)$/, 'Correo'],
]

const clip = (value, max) => String(value ?? '').trim().slice(0, max)

function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

function sourceOf(utmSource, referrerHost, ownHost) {
  if (utmSource) return clip(utmSource, 60).toLowerCase()
  if (!referrerHost || referrerHost === ownHost) return 'Directo'
  for (const [pattern, name] of SOURCES) if (pattern.test(referrerHost)) return name
  return referrerHost
}

const deviceOf = (ua) => (/ipad|tablet/i.test(ua) ? 'Tableta' : /mobi|android|iphone/i.test(ua) ? 'Celular' : 'Computadora')

// es-PE → PE. Es la región del navegador, no la ubicación exacta.
function regionOf(acceptLanguage) {
  const match = String(acceptLanguage || '').match(/^[a-z]{2,3}-([A-Z]{2})\b/i)
  return match ? match[1].toUpperCase() : ''
}

// Las direcciones de eventos se agrupan para no exponer el enlace de cada uno.
export function pageOf(path) {
  if (/^\/e\/[^/]+/.test(path)) return '/e/(evento)'
  return path
}

const perHour = new Map()
setInterval(() => perHour.clear(), 60 * 60 * 1000).unref()

/** La cookie del navegador; si no tiene, crea una nueva. */
function visitorOf(req, res, readCookie) {
  const current = readCookie(req, VISITOR_COOKIE)
  if (VISITOR_PATTERN.test(current)) return current
  const id = crypto.randomBytes(16).toString('hex')
  const secure = req.secure ? '; Secure' : ''
  res.append('Set-Cookie', `${VISITOR_COOKIE}=${id}; Path=/; Max-Age=${VISITOR_DAYS * 86400}; HttpOnly; SameSite=Lax${secure}`)
  return id
}

/** Al iniciar sesión, las visitas de ese navegador pasan a la cuenta. */
export function linkVisitor(req, userId, readCookie) {
  const visitor = readCookie(req, VISITOR_COOKIE)
  if (!VISITOR_PATTERN.test(visitor) || !userId) return
  try {
    pdb.prepare('UPDATE visits SET user_id = ? WHERE visitor = ? AND user_id IS NULL').run(userId, visitor)
  } catch (err) {
    console.error('[visitas]', err)
  }
}

/** POST /api/visit: la app lo llama al abrir cada página. */
export function mountVisits(app, { sessionUser, readCookie }) {
  app.post('/api/visit', (req, res) => {
    const ua = String(req.get('user-agent') || '')
    if (!ua || BOT.test(ua)) return res.status(204).end()
    const visitor = visitorOf(req, res, readCookie)
    const count = (perHour.get(visitor) || 0) + 1
    perHour.set(visitor, count)
    if (count > MAX_PER_HOUR) return res.status(204).end()

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const rawPath = clip(body.path, 200)
    const path = rawPath.startsWith('/') ? rawPath.split(/[?#]/)[0] : '/'
    const ownHost = String(req.get('host') || '').toLowerCase().replace(/^www\./, '')
    const referrerHost = hostOf(clip(body.referrer, 500))
    const user = sessionUser(req)
    try {
      pdb
        .prepare(
          'INSERT INTO visits (at, visitor, user_id, path, source, medium, campaign, referrer, device, region) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          nowIso(),
          visitor,
          user?.id ?? null,
          path,
          sourceOf(clip(body.utm_source, 60), referrerHost, ownHost),
          clip(body.utm_medium, 60).toLowerCase(),
          clip(body.utm_campaign, 100),
          referrerHost === ownHost ? '' : referrerHost,
          deviceOf(ua),
          regionOf(req.get('accept-language')),
        )
      if (user) linkVisitor(req, user.id, readCookie)
    } catch (err) {
      console.error('[visitas]', err)
    }
    res.status(204).end()
  })
}

// ---------- resumen para /admin ----------

// Días en hora de Lima (UTC-5), que es donde está la mayoría.
const DAY = "substr(datetime(at, '-5 hours'), 1, 10)"
const dayOfIso = (iso) => new Date(new Date(iso).getTime() - 5 * 3600000).toISOString().slice(0, 10)

export function visitsSummary(days) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const one = (sql, ...args) => pdb.prepare(sql).get(...args)
  const all = (sql, ...args) => pdb.prepare(sql).all(...args)

  const totals = {
    visitors: one('SELECT COUNT(DISTINCT visitor) n FROM visits WHERE at >= ?', since).n,
    views: one('SELECT COUNT(*) n FROM visits WHERE at >= ?', since).n,
    signups: one('SELECT COUNT(*) n FROM users WHERE created_at >= ?', since).n,
    events: one('SELECT COUNT(*) n FROM events WHERE created_at >= ?', since).n,
    people: one('SELECT COUNT(*) n FROM users').n,
    withEmail: one("SELECT COUNT(*) n FROM users WHERE email <> ''").n,
    news: one('SELECT COUNT(*) n FROM users WHERE news_opt_in = 1').n,
    trackingSince: one('SELECT MIN(at) at FROM visits').at || '',
  }

  // Embudo: navegadores que visitaron → que terminaron con cuenta → cuya cuenta creó un evento.
  const funnel = one(
    `SELECT COUNT(DISTINCT v.visitor) visitors,
            COUNT(DISTINCT CASE WHEN v.user_id IS NOT NULL THEN v.visitor END) registered,
            COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM events e WHERE e.created_by = v.user_id) THEN v.visitor END) created
       FROM visits v WHERE v.at >= ?`,
    since,
  )

  // Serie diaria completa (los días sin nada van en cero).
  const visitorsByDay = new Map(all(`SELECT ${DAY} d, COUNT(DISTINCT visitor) n FROM visits WHERE at >= ? GROUP BY d`, since).map((r) => [r.d, r.n]))
  const signupsByDay = new Map(
    all(`SELECT substr(datetime(created_at, '-5 hours'), 1, 10) d, COUNT(*) n FROM users WHERE created_at >= ? GROUP BY d`, since).map((r) => [r.d, r.n]),
  )
  const daily = []
  for (let i = days - 1; i >= 0; i--) {
    const d = dayOfIso(new Date(Date.now() - i * 86400000).toISOString())
    daily.push({ day: d, visitors: visitorsByDay.get(d) || 0, signups: signupsByDay.get(d) || 0 })
  }

  // Fuente de cada navegador = la de su primera visita en el periodo.
  const sources = all(
    `WITH first AS (
        SELECT visitor, source, MAX(user_id IS NOT NULL) OVER (PARTITION BY visitor) has_user,
               ROW_NUMBER() OVER (PARTITION BY visitor ORDER BY at) rn
          FROM visits WHERE at >= ?)
     SELECT source, COUNT(*) visitors, SUM(has_user) registered FROM first WHERE rn = 1
      GROUP BY source ORDER BY visitors DESC LIMIT 15`,
    since,
  )

  const pageCounts = new Map()
  for (const r of all('SELECT path, COUNT(*) views, COUNT(DISTINCT visitor) visitors FROM visits WHERE at >= ? GROUP BY path', since)) {
    const key = pageOf(r.path)
    const prev = pageCounts.get(key) || { page: key, views: 0, visitors: 0 }
    prev.views += r.views
    prev.visitors += r.visitors
    pageCounts.set(key, prev)
  }
  const pages = [...pageCounts.values()].sort((a, b) => b.views - a.views).slice(0, 12)

  const devices = all('SELECT device label, COUNT(DISTINCT visitor) visitors FROM visits WHERE at >= ? GROUP BY device ORDER BY visitors DESC', since)
  const regions = all(
    "SELECT region label, COUNT(DISTINCT visitor) visitors FROM visits WHERE at >= ? AND region <> '' GROUP BY region ORDER BY visitors DESC LIMIT 10",
    since,
  )
  const campaigns = all(
    "SELECT campaign label, COUNT(DISTINCT visitor) visitors FROM visits WHERE at >= ? AND campaign <> '' GROUP BY campaign ORDER BY visitors DESC LIMIT 10",
    since,
  )

  return { days, totals, funnel, daily, sources, pages, devices, regions, campaigns }
}

/** Primera fuente conocida de cada cuenta (para la tabla de personas). */
export function firstSourceByUser() {
  const rows = pdb
    .prepare(
      `SELECT user_id, source FROM (
         SELECT user_id, source, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY at) rn FROM visits WHERE user_id IS NOT NULL
       ) WHERE rn = 1`,
    )
    .all()
  return new Map(rows.map((r) => [r.user_id, r.source]))
}

export function visitRows() {
  return pdb
    .prepare(
      `SELECT v.at, v.visitor, v.path, v.source, v.medium, v.campaign, v.referrer, v.device, v.region, u.name, u.email
         FROM visits v LEFT JOIN users u ON u.id = v.user_id ORDER BY v.at ASC`,
    )
    .all()
}
