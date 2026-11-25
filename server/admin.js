import crypto from 'node:crypto'
import fs from 'node:fs'
import { db, runInEvent } from './db.js'
import { historySince, pdb } from './platform.js'
import { readRows, usageSummary } from './usage.js'
import { firstSourceByUser, visitRows, visitsSummary } from './visits.js'

/*
 * Base de personas e historial de Juntay, para descargar en CSV desde /admin.
 * Solo con la clave ADMIN_KEY (variable de entorno). Sin ella, /admin no existe.
 */

const ADMIN_KEY = process.env.ADMIN_KEY || ''

const CATEGORY = { trabajo: 'Trabajo', familiar: 'Familiar', entretenimiento: 'Entretenimiento', finanzas: 'Finanzas personales' }
const KIND = {
  registro: 'Se registró',
  ingreso: 'Inició sesión',
  'creó evento': 'Creó un evento',
  'se unió': 'Se unió a un evento',
  actividad: 'Actividad en el evento',
}

/** Datos de cada evento: nombre, categoría y su registro de actividad (para reconstruir lo de antes). */
function eventInfo() {
  const events = pdb.prepare('SELECT id, slug FROM events').all()
  const info = new Map()
  for (const event of events) {
    try {
      info.set(
        event.slug,
        runInEvent(event.slug, () => {
          const s = db.prepare('SELECT event_name, event_category, event_type FROM settings WHERE id = 1').get() || {}
          const log = db.prepare('SELECT actor_id, actor_name, entity, detail, created_at FROM activity_log ORDER BY id ASC').all()
          return { id: event.id, name: s.event_name || event.slug, category: s.event_category || '', log }
        }),
      )
    } catch (err) {
      console.error('[admin] no se pudo leer', event.slug, err)
    }
  }
  return info
}

/** Historial completo: lo guardado desde que existe la tabla, más lo anterior reconstruido. */
export function buildHistory(events = eventInfo()) {
  const since = historySince()
  const users = new Map(pdb.prepare('SELECT id, name, email, created_at FROM users').all().map((u) => [u.id, u]))
  const rows = []
  const push = (at, userId, kind, slug, detail, fallbackName = '') => {
    const user = users.get(userId)
    rows.push({
      at,
      userId: user ? user.id : null,
      name: user?.name || fallbackName,
      email: user?.email || '',
      kind: KIND[kind] || kind,
      event: slug ? events.get(slug)?.name || slug : '',
      category: slug ? CATEGORY[events.get(slug)?.category] || '' : '',
      detail,
    })
  }

  for (const h of pdb.prepare('SELECT at, user_id, kind, slug, detail FROM history ORDER BY at ASC').all()) {
    push(h.at, h.user_id, h.kind, h.slug, h.detail)
  }

  // Antes de que existiera el historial: registro, eventos creados, uniones y actividad de cada evento.
  for (const user of users.values()) if (user.created_at < since) push(user.created_at, user.id, 'registro', '', 'Primera vez en Juntay')
  for (const e of pdb.prepare('SELECT slug, created_by, created_at FROM events WHERE created_at < ?').all(since)) {
    push(e.created_at, e.created_by, 'creó evento', e.slug, '')
  }
  const links = pdb
    .prepare('SELECT e.slug, eu.user_id, eu.role, eu.member_id, eu.joined_at FROM event_users eu JOIN events e ON e.id = eu.event_id')
    .all()
  for (const link of links) {
    if (link.joined_at < since && link.role !== 'admin') push(link.joined_at, link.user_id, 'se unió', link.slug, '')
  }
  // La actividad del evento está ligada al imán: se atribuye a la cuenta que hoy tiene ese imán.
  for (const [slug, event] of events) {
    const owner = new Map(links.filter((l) => l.slug === slug && l.member_id).map((l) => [l.member_id, l.user_id]))
    for (const entry of event.log) {
      if (entry.created_at >= since) continue
      push(entry.created_at, owner.get(entry.actor_id) ?? null, 'actividad', slug, `${entry.entity}: ${entry.detail}`, entry.actor_name)
    }
  }

  return rows.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
}

/** Una fila por persona: nombre, correo, primera vez, última vez y cuánto usa Juntay. */
export function buildPeople() {
  const users = pdb.prepare('SELECT id, name, email, news_opt_in, created_at, last_login_at FROM users ORDER BY created_at ASC').all()
  const events = eventInfo()
  const history = buildHistory(events)
  const nameOf = new Map([...events].map(([slug, e]) => [slug, e.name]))
  const memberships = pdb
    .prepare('SELECT eu.user_id, eu.role, e.slug FROM event_users eu JOIN events e ON e.id = eu.event_id')
    .all()
  const sourceOf = firstSourceByUser()
  const byUser = new Map()
  for (const row of history) {
    if (row.userId === null) continue
    const stats = byUser.get(row.userId) || { count: 0, last: '' }
    stats.count += 1
    if (row.at > stats.last) stats.last = row.at
    byUser.set(row.userId, stats)
  }
  return users.map((u) => {
    const mine = memberships.filter((m) => m.user_id === u.id)
    const stats = byUser.get(u.id) || { count: 0, last: '' }
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      news: u.news_opt_in ? 'sí' : 'no',
      first: u.created_at,
      last_login: u.last_login_at,
      last_activity: stats.last || u.last_login_at,
      actions: stats.count,
      events: mine.length,
      organizes: mine.filter((m) => m.role === 'admin').length,
      categories: [...new Set(mine.map((m) => CATEGORY[events.get(m.slug)?.category]).filter(Boolean))].join(' / '),
      event_names: mine.map((m) => nameOf.get(m.slug) || m.slug).join(' / '),
      source: sourceOf.get(u.id) || '',
    }
  })
}

// CSV con BOM para que Excel y Google Sheets muestren bien las tildes.
const cell = (value) => {
  const text = String(value ?? '')
  // Evita que una celda que empieza con = + - @ se ejecute como fórmula al abrirla.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}
const csv = (header, rows) => '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'

export function peopleCsv() {
  return csv(
    ['id', 'nombre', 'correo', 'acepta_novedades', 'primera_vez', 'ultimo_ingreso', 'ultima_actividad', 'acciones', 'eventos', 'organiza', 'categorias', 'nombres_de_eventos', 'llego_desde'],
    buildPeople().map((p) => [p.id, p.name, p.email, p.news, p.first, p.last_login, p.last_activity, p.actions, p.events, p.organizes, p.categories, p.event_names, p.source]),
  )
}

export function historyCsv() {
  return csv(
    ['fecha', 'nombre', 'correo', 'que_hizo', 'evento', 'categoria', 'detalle'],
    buildHistory().map((h) => [h.at, h.name, h.email, h.kind, h.event, h.category, h.detail]),
  )
}

export function visitsCsv() {
  return csv(
    ['fecha', 'navegador', 'pagina', 'fuente', 'medio', 'campana', 'pagina_anterior', 'dispositivo', 'region', 'nombre', 'correo'],
    visitRows().map((v) => [v.at, v.visitor.slice(0, 8), v.path, v.source, v.medium, v.campaign, v.referrer, v.device, v.region, v.name || '', v.email || '']),
  )
}

export function readsCsv() {
  return csv(
    ['fecha', 'nombre', 'correo', 'tipo', 'evento', 'leyo', 'modelo', 'tokens_entrada', 'tokens_salida', 'costo_usd', 'milisegundos', 'falla_de_claude'],
    readRows().map((r) => [r.at, r.name || '', r.email || '', r.kind, r.slug, r.source, r.model, r.input_tokens, r.output_tokens, r.cost_usd.toFixed(5), r.ms, r.error]),
  )
}

function keyMatches(given) {
  if (!ADMIN_KEY || typeof given !== 'string') return false
  const a = crypto.createHash('sha256').update(given).digest()
  const b = crypto.createHash('sha256').update(ADMIN_KEY).digest()
  return crypto.timingSafeEqual(a, b)
}

const PAGE = fs.readFileSync(new URL('./admin.html', import.meta.url), 'utf8')

/** /admin y sus descargas. Sin ADMIN_KEY configurada responden 404, como si no existieran. */
export function mountAdmin(app, { tooManyAttempts, failAttempt }) {
  app.get('/admin', (_req, res) => {
    if (!ADMIN_KEY) return res.status(404).end()
    res.setHeader('Cache-Control', 'no-store')
    res.type('html').send(PAGE)
  })
  const guard = (req, res, next) => {
    if (!ADMIN_KEY) return res.status(404).end()
    const key = `admin:${req.ip}`
    if (tooManyAttempts(key)) return res.status(429).json({ error: 'Demasiados intentos' })
    if (!keyMatches(req.get('x-admin-key'))) {
      failAttempt(key)
      return res.status(401).json({ error: 'Clave incorrecta' })
    }
    res.setHeader('Cache-Control', 'no-store')
    next()
  }
  app.get('/api/admin/personas.csv', guard, (_req, res) => res.type('text/csv; charset=utf-8').send(peopleCsv()))
  app.get('/api/admin/historial.csv', guard, (_req, res) => res.type('text/csv; charset=utf-8').send(historyCsv()))
  app.get('/api/admin/visitas.csv', guard, (_req, res) => res.type('text/csv; charset=utf-8').send(visitsCsv()))
  app.get('/api/admin/lecturas.csv', guard, (_req, res) => res.type('text/csv; charset=utf-8').send(readsCsv()))
  // Todo lo que muestra el panel, en una sola llamada.
  app.get('/api/admin/resumen', guard, (req, res) => {
    const days = [7, 30, 90, 365].includes(Number(req.query.dias)) ? Number(req.query.dias) : 30
    const events = eventInfo()
    const recent = buildHistory(events).slice(-80).reverse()
    res.json({ ...visitsSummary(days), people: buildPeople(), recent, ai: usageSummary(days) })
  })
}
