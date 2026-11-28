import { db, runInEvent } from './db.js'
import { pdb } from './platform.js'

/*
 * Lo que el panel /admin muestra además de las visitas:
 * - cómo entra la gente (Google o el código del correo) y si los correos llegan a servir,
 * - cuántas personas vuelven a usar Juntay (activas por día, semana y mes),
 * - retención por semana de registro,
 * - qué tan vivo está cada evento y qué partes de la app se usan.
 *
 * Todas las fechas se agrupan con la hora de Lima (UTC-5), igual que el resto del panel.
 */

const LIMA = 5 * 3600000
const dayOf = (iso) => new Date(new Date(iso).getTime() - LIMA).toISOString().slice(0, 10)
const DAY = (col) => `substr(datetime(${col}, '-5 hours'), 1, 10)`
const sinceDays = (days) => new Date(Date.now() - days * 86400000).toISOString()
const one = (sql, ...args) => pdb.prepare(sql).get(...args)
const all = (sql, ...args) => pdb.prepare(sql).all(...args)

/** Serie diaria completa de los últimos `days` días (los días sin nada van en cero). */
function series(days, maps) {
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const day = dayOf(new Date(Date.now() - i * 86400000).toISOString())
    const row = { day }
    for (const [name, map] of Object.entries(maps)) row[name] = map.get(day) || 0
    out.push(row)
  }
  return out
}
const byDay = (rows) => new Map(rows.map((r) => [r.d, r.n]))

// ---------- ingreso ----------

const ACCOUNT_KIND = `CASE
    WHEN google_sub LIKE 'correo:%' THEN 'Correo con código'
    WHEN google_sub LIKE 'nombre:%' THEN 'Nombre y correo (sin comprobar)'
    ELSE 'Google' END`

export function loginSummary(days) {
  const statsSince = one("SELECT value FROM meta WHERE key = 'login_stats_since'")?.value || ''
  const since = sinceDays(days)
  const from = statsSince > since ? statsSince : since
  const now = new Date().toISOString()
  const codes = one(
    `SELECT COUNT(*) sent,
            COALESCE(SUM(ok_at IS NOT NULL), 0) ok,
            COALESCE(SUM(send_error <> ''), 0) failed,
            COALESCE(SUM(ok_at IS NULL AND send_error = '' AND attempts >= 5), 0) blocked,
            COALESCE(SUM(ok_at IS NULL AND send_error = '' AND attempts < 5 AND expires_at < ?), 0) unused,
            COUNT(DISTINCT email) people,
            COUNT(DISTINCT CASE WHEN ok_at IS NOT NULL THEN email END) peopleOk
       FROM login_codes WHERE created_at >= ?`,
    now,
    from,
  )
  // Personas que pidieron código y nunca lograron entrar en el periodo: a quién escribirle.
  const stuck = all(
    `SELECT email, MAX(name) name, COUNT(*) codes, MAX(created_at) last, MAX(send_error) error
       FROM login_codes WHERE created_at >= ?
      GROUP BY email HAVING SUM(ok_at IS NOT NULL) = 0 ORDER BY last DESC LIMIT 20`,
    from,
  )
  const sendErrors = all(
    "SELECT send_error label, COUNT(*) n FROM login_codes WHERE created_at >= ? AND send_error <> '' GROUP BY send_error ORDER BY n DESC LIMIT 6",
    from,
  )
  const daily = series(days, {
    sent: byDay(all(`SELECT ${DAY('created_at')} d, COUNT(*) n FROM login_codes WHERE created_at >= ? GROUP BY d`, from)),
    ok: byDay(all(`SELECT ${DAY('ok_at')} d, COUNT(*) n FROM login_codes WHERE ok_at >= ? GROUP BY d`, from)),
  })
  const accounts = all(`SELECT ${ACCOUNT_KIND} label, COUNT(*) n FROM users GROUP BY label ORDER BY n DESC`)
  const newAccounts = all(`SELECT ${ACCOUNT_KIND} label, COUNT(*) n FROM users WHERE created_at >= ? GROUP BY label ORDER BY n DESC`, since)
  // Inicios de sesión por forma (el historial anota la forma desde que existe este panel).
  const logins = all(
    `SELECT CASE WHEN detail LIKE 'Inició sesión con %' THEN substr(detail, 19) ELSE 'sin dato (antes)' END label, COUNT(*) n
       FROM history WHERE kind = 'ingreso' AND at >= ? GROUP BY label ORDER BY n DESC`,
    since,
  )
  return { statsSince, codes, stuck, sendErrors, daily, accounts, newAccounts, logins }
}

// ---------- personas activas y retención ----------

/** Cada (persona, momento) en que usó Juntay: visitas con sesión y hechos del historial. */
const ACTIVITY = `SELECT user_id, at FROM visits WHERE user_id IS NOT NULL AND at >= ?
                  UNION ALL SELECT user_id, at FROM history WHERE user_id IS NOT NULL AND at >= ?`

export function activeSummary(days) {
  const since = sinceDays(days)
  const count = (from) => one(`SELECT COUNT(DISTINCT user_id) n FROM (${ACTIVITY})`, from, from).n
  const today = dayOf(new Date().toISOString())
  const startToday = new Date(new Date(today + 'T00:00:00Z').getTime() + LIMA).toISOString()
  const totals = {
    today: count(startToday),
    week: count(sinceDays(7)),
    month: count(sinceDays(30)),
    period: count(since),
    // Activas en el periodo que ya tenían cuenta antes: las que volvieron.
    returning: one(
      `SELECT COUNT(DISTINCT a.user_id) n FROM (${ACTIVITY}) a JOIN users u ON u.id = a.user_id WHERE u.created_at < ?`,
      since,
      since,
      since,
    ).n,
    // Las que cambiaron algo dentro de un evento, no solo miraron.
    editors: one("SELECT COUNT(DISTINCT user_id) n FROM history WHERE kind = 'actividad' AND at >= ? AND user_id IS NOT NULL", since).n,
    people: one('SELECT COUNT(*) n FROM users').n,
  }
  const daily = series(days, {
    active: byDay(all(`SELECT ${DAY('at')} d, COUNT(DISTINCT user_id) n FROM (${ACTIVITY}) GROUP BY d`, since, since)),
    signups: byDay(all(`SELECT ${DAY('created_at')} d, COUNT(*) n FROM users WHERE created_at >= ? GROUP BY d`, since)),
  })
  return { totals, daily }
}

/** Lunes (hora de Lima) de la semana de una fecha, como 'AAAA-MM-DD'. */
function weekOf(iso) {
  const d = new Date(new Date(iso).getTime() - LIMA)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/**
 * Retención por semana de registro: de quienes crearon su cuenta cada semana, qué parte
 * volvió a usar Juntay 1, 2, 3… semanas después. La semana 0 es la del registro.
 */
export function retention(weeks = 8) {
  const thisWeek = weekOf(new Date().toISOString())
  const first = new Date(thisWeek + 'T00:00:00Z')
  first.setUTCDate(first.getUTCDate() - 7 * (weeks - 1))
  const from = new Date(first.getTime() + LIMA).toISOString()
  const users = all('SELECT id, created_at FROM users WHERE created_at >= ?', from)
  const cohortOf = new Map(users.map((u) => [u.id, weekOf(u.created_at)]))
  const seen = new Map() // user_id → set de índices de semana con actividad
  for (const a of all(ACTIVITY, from, from)) {
    const start = cohortOf.get(a.user_id)
    if (!start) continue
    const index = Math.round((new Date(weekOf(a.at)) - new Date(start)) / (7 * 86400000))
    if (index < 1) continue
    if (!seen.has(a.user_id)) seen.set(a.user_id, new Set())
    seen.get(a.user_id).add(index)
  }
  const cohorts = []
  for (let i = 0; i < weeks; i++) {
    const start = new Date(first)
    start.setUTCDate(start.getUTCDate() + 7 * i)
    const week = start.toISOString().slice(0, 10)
    const members = users.filter((u) => cohortOf.get(u.id) === week)
    const possible = weeks - 1 - i // semanas que ya pasaron desde esa cohorte
    const back = []
    for (let w = 1; w <= possible; w++) back.push(members.filter((u) => seen.get(u.id)?.has(w)).length)
    cohorts.push({ week, size: members.length, back })
  }
  return { weeks, cohorts }
}

// ---------- eventos ----------

const ENTITY = {
  task: 'Actividades',
  agreement: 'Acuerdos',
  budget: 'Presupuesto y cuotas',
  member: 'Equipo',
  secreto: 'Amigo secreto',
  settings: 'Ajustes',
  app: 'Respaldo',
}
const CATEGORY = { trabajo: 'Trabajo', familiar: 'Familiar', entretenimiento: 'Entretenimiento', finanzas: 'Finanzas personales' }

const safe = (fn, fallback) => {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export function eventsSummary(days) {
  const since = sinceDays(days)
  const week = sinceDays(7)
  const events = all(
    `SELECT e.id, e.slug, e.created_at, u.name organizer,
            (SELECT COUNT(*) FROM event_users eu WHERE eu.event_id = e.id) accounts
       FROM events e LEFT JOIN users u ON u.id = e.created_by`,
  )
  const readsBySlug = new Map(all("SELECT slug, COUNT(*) n FROM ai_reads WHERE slug <> '' GROUP BY slug").map((r) => [r.slug, r.n]))
  const features = new Map()
  const rows = []
  for (const e of events) {
    const row = safe(
      () =>
        runInEvent(e.slug, () => {
          const s = db.prepare('SELECT event_name, event_category, event_type, event_date FROM settings WHERE id = 1').get() || {}
          const tasks = db.prepare("SELECT COUNT(*) total, COALESCE(SUM(status = 'hecha'), 0) done FROM tasks").get()
          const changes = db.prepare('SELECT COUNT(*) n FROM activity_log WHERE created_at >= ?').get(since).n
          const changesWeek = db.prepare('SELECT COUNT(*) n FROM activity_log WHERE created_at >= ?').get(week).n
          const last = db.prepare('SELECT MAX(created_at) at FROM activity_log').get().at || ''
          const people = db.prepare('SELECT COUNT(*) n FROM members').get().n
          const editors = db.prepare('SELECT COUNT(DISTINCT actor_name) n FROM activity_log WHERE created_at >= ?').get(since).n
          const used = db.prepare('SELECT entity, COUNT(*) n FROM activity_log WHERE created_at >= ? GROUP BY entity').all(since)
          for (const u of used) features.set(u.entity, (features.get(u.entity) || 0) + u.n)
          return {
            name: s.event_name || e.slug,
            category: CATEGORY[s.event_category] || '',
            type: s.event_type || '',
            date: s.event_date || '',
            tasks: tasks.total,
            tasksDone: tasks.done,
            people,
            changes,
            changesWeek,
            editors,
            last,
            parts: used.sort((a, b) => b.n - a.n).map((u) => ENTITY[u.entity] || u.entity),
          }
        }),
      null,
    )
    if (!row) continue
    rows.push({ slug: e.slug, created: e.created_at, organizer: e.organizer || '', accounts: e.accounts, reads: readsBySlug.get(e.slug) || 0, ...row })
  }
  rows.sort((a, b) => b.changes - a.changes || (b.last > a.last ? 1 : -1))
  const totals = {
    events: rows.length,
    alive: rows.filter((r) => r.changesWeek > 0).length,
    activeInPeriod: rows.filter((r) => r.changes > 0).length,
    changes: rows.reduce((n, r) => n + r.changes, 0),
  }
  const parts = [...features].map(([entity, n]) => ({ label: ENTITY[entity] || entity, n })).sort((a, b) => b.n - a.n)
  return { totals, rows, parts }
}
