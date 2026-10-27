import express from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  db,
  getBootstrap,
  getSettings,
  listBudget,
  listMembers,
  listTasks,
  logActivity,
  nowIso,
  plain,
} from './db.js'
import { seedDemo } from './seed.js'
import { scrapeQuoteImage } from './ocr.js'


const here = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || '0.0.0.0'
const DIST = path.join(here, '..', 'dist')

seedDemo()

const app = express()
// Detrás del proxy de Railway (u otro), para saber si la conexión es https.
app.set('trust proxy', 1)
app.use(express.json({ limit: '15mb' }))

// ---------- código de acceso del equipo ----------
// Con TEAM_CODE definido, la API exige el código una vez por dispositivo (cookie de un año).
// Sin TEAM_CODE (uso local), la app queda abierta como antes.

const TEAM_CODE = String(process.env.TEAM_CODE || '').trim()
const ACCESS_COOKIE = 'alfin_team'
const ACCESS_TOKEN = TEAM_CODE ? crypto.createHmac('sha256', TEAM_CODE).update('alfin-desayuno').digest('hex') : ''
const MAX_ATTEMPTS = 10
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const attempts = new Map()

function readCookie(req, name) {
  const raw = req.get('cookie') || ''
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return ''
}

function sameSecret(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function hasAccess(req) {
  return !TEAM_CODE || sameSecret(readCookie(req, ACCESS_COOKIE), ACCESS_TOKEN)
}

const VERSION = (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || 'local'
app.get('/api/health', (_req, res) => res.json({ ok: true, version: VERSION }))

app.get('/api/auth', (req, res) => res.json({ required: Boolean(TEAM_CODE), ok: hasAccess(req) }))

app.post('/api/auth', (req, res) => {
  if (!TEAM_CODE) return res.json({ ok: true })
  const key = req.ip || 'desconocido'
  const now = Date.now()
  const record = attempts.get(key)
  const recent = record && now - record.first < ATTEMPT_WINDOW_MS ? record : { first: now, count: 0 }
  if (recent.count >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos y vuelve a probar.' })
  }
  const code = String(req.body?.code || '').trim()
  if (!sameSecret(code.toLowerCase(), TEAM_CODE.toLowerCase())) {
    attempts.set(key, { first: recent.first, count: recent.count + 1 })
    return res.status(401).json({ error: 'Ese código no es el del equipo.' })
  }
  attempts.delete(key)
  const secure = req.secure ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${ACCESS_COOKIE}=${ACCESS_TOKEN}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`,
  )
  res.json({ ok: true })
})

app.use('/api', (req, res, next) => {
  if (hasAccess(req)) return next()
  res.status(401).json({ error: 'Falta el código del equipo', reason: 'team-code' })
})

// ---------- helpers ----------

const sseClients = new Set()

function broadcast() {
  const payload = `data: ${JSON.stringify({ type: 'change', at: nowIso() })}\n\n`
  for (const client of sseClients) {
    try {
      client.write(payload)
    } catch {
      sseClients.delete(client)
    }
  }
}

function detectDevice(ua = '') {
  if (/android/i.test(ua)) return 'Android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'iPhone'
  if (/windows/i.test(ua)) return 'Windows PC'
  if (/macintosh|mac os x/i.test(ua)) return 'Mac'
  if (/linux/i.test(ua)) return 'Linux'
  return 'Web'
}

function touchPresence(memberId, memberName, userAgent = '', viewName = '') {
  if (!memberId) return
  const device = detectDevice(userAgent)
  const existing = db.prepare('SELECT total_visits FROM member_presence WHERE member_id = ?').get(memberId)
  if (existing) {
    db.prepare(
      'UPDATE member_presence SET last_seen_at = ?, device = ?, user_agent = ?, total_visits = total_visits + 1, last_view = ? WHERE member_id = ?',
    ).run(nowIso(), device, userAgent, viewName || 'app', memberId)
  } else {
    db.prepare(
      'INSERT INTO member_presence (member_id, last_seen_at, device, user_agent, total_visits, last_view) VALUES (?, ?, ?, ?, 1, ?)',
    ).run(memberId, nowIso(), device, userAgent, viewName || 'app')
  }

  if (viewName) {
    try {
      db.prepare(
        'INSERT INTO page_views (member_id, member_name, view_name, device, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(memberId, memberName, viewName, device, nowIso())
      db.prepare('DELETE FROM page_views WHERE id NOT IN (SELECT id FROM page_views ORDER BY id DESC LIMIT 100)').run()
    } catch {
      /* ignore */
    }
  }
}

function actor(req) {
  const header = req.get('x-actor-id')
  const id = Number(header)
  if (!id) return { id: null, name: 'Alguien', is_lead: 0 }
  const member = db.prepare('SELECT id, name, is_lead FROM members WHERE id = ?').get(id)
  if (member) {
    touchPresence(member.id, member.name, req.get('user-agent'), '')
    return { id: member.id, name: member.name, is_lead: member.is_lead }
  }
  return { id: null, name: 'Alguien', is_lead: 0 }
}

function note(req, entity, entityId, action, detail) {
  const who = actor(req)
  logActivity({ actorId: who.id, actorName: who.name, entity, entityId, action, detail })
}

function text(value, fallback = '') {
  if (value === undefined || value === null) return fallback
  return String(value).trim().slice(0, 2000)
}

// Fotos como data URL (ya comprimidas en el celular). `text()` las cortaría a 2000 caracteres.
const MAX_IMAGE_CHARS = 4_000_000
function imageData(value, fallback = '') {
  if (value === undefined || value === null) return fallback
  const clean = String(value).trim()
  if (clean === '') return ''
  if (!/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(clean) || clean.length > MAX_IMAGE_CHARS) return fallback
  return clean
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}

function num(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function dateOrNull(value) {
  const clean = text(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : null
}

function memberOrNull(value) {
  const id = Number(value)
  if (!id) return null
  const found = db.prepare('SELECT id FROM members WHERE id = ?').get(id)
  return found ? found.id : null
}

const TASK_STATUS = ['pendiente', 'en_curso', 'bloqueada', 'hecha']
const PRIORITY = ['alta', 'media', 'baja']
const AGREEMENT_STATUS = ['propuesto', 'acordado', 'cumplido']
const BUDGET_STATUS = ['pendiente', 'hecho']
const BUDGET_CATEGORY = ['', 'cuota']
const BUDGET_STAGE = ['plan', 'real']

function planOrNull(value) {
  const id = Number(value)
  if (!id) return null
  const found = db.prepare("SELECT id FROM budget_items WHERE id = ? AND stage = 'plan'").get(id)
  return found ? found.id : null
}
const AREAS = ['Coordinación', 'Finanzas', 'Compras', 'Cocina', 'Logística', 'Ambientación', 'Servicio', 'Comunicación', 'Regalos', 'Dinámicas']

function taskDetail(id) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
  if (!task) return null
  const optionsRaw = db.prepare('SELECT * FROM task_options WHERE task_id = ? ORDER BY id ASC').all(id).map(plain)
  const votesRaw = db
    .prepare('SELECT * FROM task_option_votes WHERE option_id IN (SELECT id FROM task_options WHERE task_id = ?)')
    .all(id)
    .map(plain)
  const votesByOption = new Map()
  for (const v of votesRaw) {
    if (!votesByOption.has(v.option_id)) votesByOption.set(v.option_id, [])
    votesByOption.get(v.option_id).push(v.member_id)
  }
  const options = optionsRaw.map((opt) => ({
    ...opt,
    votes: votesByOption.get(opt.id) || [],
    vote_count: (votesByOption.get(opt.id) || []).length,
  }))

  return {
    ...plain(task),
    assignees: db.prepare('SELECT member_id FROM task_assignees WHERE task_id = ?').all(id).map((r) => r.member_id),
    checklist: db.prepare('SELECT * FROM checklist_items WHERE task_id = ? ORDER BY position, id').all(id).map(plain),
    options,
  }
}

function setAssignees(taskId, memberIds) {
  db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(taskId)
  const insert = db.prepare('INSERT OR IGNORE INTO task_assignees (task_id, member_id) VALUES (?, ?)')
  for (const raw of Array.isArray(memberIds) ? memberIds : []) {
    const id = memberOrNull(raw)
    if (id) insert.run(taskId, id)
  }
}

// ---------- bootstrap ----------

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, at: nowIso(), version: 1 })
})

app.get('/api/bootstrap', (_req, res) => {
  res.json(getBootstrap())
})

app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write('retry: 3000\n\n')
  res.write(`data: ${JSON.stringify({ type: 'hello', at: nowIso() })}\n\n`)
  sseClients.add(res)
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n')
    } catch {
      /* se limpia al cerrar */
    }
  }, 25000)
  req.on('close', () => {
    clearInterval(heartbeat)
    sseClients.delete(res)
  })
})

// ---------- settings ----------

app.patch('/api/settings', (req, res) => {
  const current = getSettings()
  const body = req.body || {}
  const next = {
    event_name: text(body.event_name, current.event_name) || 'Al Fin Desayuno',
    event_date: dateOrNull(body.event_date) ?? current.event_date,
    event_time: text(body.event_time, current.event_time),
    location: text(body.location, current.location),
    guests: Math.max(1, Math.round(num(body.guests, current.guests))),
    team_size: Math.max(1, Math.round(num(body.team_size, current.team_size))),
    note: text(body.note, current.note),
    treasurer_id: body.treasurer_id === undefined ? current.treasurer_id : memberOrNull(body.treasurer_id),
  }
  db.prepare(
    `UPDATE settings SET event_name=?, event_date=?, event_time=?, location=?, guests=?, team_size=?, note=?, treasurer_id=?, updated_at=? WHERE id=1`,
  ).run(next.event_name, next.event_date, next.event_time, next.location, next.guests, next.team_size, next.note, next.treasurer_id, nowIso())
  note(req, 'settings', 1, 'update', 'Actualizó los datos del evento')
  broadcast()
  res.json({ settings: getSettings() })
})

// ---------- members ----------

app.get('/api/members', (_req, res) => res.json(listMembers()))

app.post('/api/members', (req, res) => {
  const body = req.body || {}
  const name = text(body.name)
  if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' })
  const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM members').get().p
  const result = db
    .prepare(
      `INSERT INTO members (name, role, area, phone, email, color, is_lead, photo_url, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      name,
      text(body.role),
      text(body.area),
      text(body.phone),
      text(body.email),
      text(body.color) || '#E4572E',
      body.is_lead ? 1 : 0,
      imageData(body.photo_url),
      position,
      nowIso(),
    )
  const id = Number(result.lastInsertRowid)
  note(req, 'member', id, 'create', `Agregó a ${name} al equipo`)
  broadcast()
  res.status(201).json({ member: plain(db.prepare('SELECT * FROM members WHERE id = ?').get(id)) })
})

app.patch('/api/members/:id', (req, res) => {
  const id = Number(req.params.id)
  const current = db.prepare('SELECT * FROM members WHERE id = ?').get(id)
  if (!current) return res.status(404).json({ error: 'Integrante no encontrado' })
  const body = req.body || {}
  const next = {
    name: text(body.name, current.name) || current.name,
    role: text(body.role, current.role),
    area: text(body.area, current.area),
    phone: text(body.phone, current.phone),
    email: text(body.email, current.email),
    color: text(body.color, current.color),
    is_lead: body.is_lead === undefined ? current.is_lead : body.is_lead ? 1 : 0,
    photo_url: imageData(body.photo_url, current.photo_url || ''),
  }
  db.prepare('UPDATE members SET name=?, role=?, area=?, phone=?, email=?, color=?, is_lead=?, photo_url=? WHERE id=?').run(
    next.name,
    next.role,
    next.area,
    next.phone,
    next.email,
    next.color,
    next.is_lead,
    next.photo_url,
    id,
  )
  const onlyPhoto = Object.keys(body).length === 1 && body.photo_url !== undefined
  note(req, 'member', id, 'update', onlyPhoto ? `${next.name} actualizó su foto` : `Actualizó el perfil de ${next.name}`)
  broadcast()
  res.json({ member: plain(db.prepare('SELECT * FROM members WHERE id = ?').get(id)) })
})

app.delete('/api/members/:id', (req, res) => {
  const id = Number(req.params.id)
  const current = db.prepare('SELECT * FROM members WHERE id = ?').get(id)
  if (!current) return res.status(404).json({ error: 'Integrante no encontrado' })
  db.prepare('DELETE FROM members WHERE id = ?').run(id)
  note(req, 'member', id, 'delete', `Retiró a ${current.name} del equipo`)
  broadcast()
  res.json({ ok: true })
})

// ---------- tasks ----------

app.get('/api/tasks', (_req, res) => res.json(listTasks()))

app.post('/api/tasks', (req, res) => {
  const body = req.body || {}
  const title = text(body.title)
  if (!title) return res.status(400).json({ error: 'El título es obligatorio' })
  const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM tasks').get().p
  const result = db
    .prepare(
      `INSERT INTO tasks (title, detail, area, status, priority, due_date, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      title,
      text(body.detail),
      text(body.area) || AREAS[0],
      oneOf(body.status, TASK_STATUS, 'pendiente'),
      oneOf(body.priority, PRIORITY, 'media'),
      dateOrNull(body.due_date),
      position,
      nowIso(),
      nowIso(),
    )
  const id = Number(result.lastInsertRowid)
  setAssignees(id, body.member_ids)

  const insertCheck = db.prepare(
    'INSERT INTO checklist_items (task_id, title, done, position, done_by, done_at) VALUES (?, ?, 0, ?, NULL, NULL)',
  )
  ;(Array.isArray(body.checklist) ? body.checklist : []).forEach((item, index) => {
    const titleText = text(typeof item === 'string' ? item : item?.title)
    if (titleText) insertCheck.run(id, titleText, index)
  })

  note(req, 'task', id, 'create', `Creó la actividad “${title}”`)
  broadcast()
  res.status(201).json({ task: taskDetail(id) })
})

app.patch('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id)
  const current = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
  if (!current) return res.status(404).json({ error: 'Actividad no encontrada' })
  const body = req.body || {}
  const next = {
    title: text(body.title, current.title) || current.title,
    detail: body.detail === undefined ? current.detail : text(body.detail),
    area: text(body.area, current.area),
    status: oneOf(body.status, TASK_STATUS, current.status),
    priority: oneOf(body.priority, PRIORITY, current.priority),
    due_date: body.due_date === undefined ? current.due_date : dateOrNull(body.due_date),
  }
  db.prepare(
    'UPDATE tasks SET title=?, detail=?, area=?, status=?, priority=?, due_date=?, updated_at=? WHERE id=?',
  ).run(next.title, next.detail, next.area, next.status, next.priority, next.due_date, nowIso(), id)

  if (body.member_ids !== undefined) setAssignees(id, body.member_ids)

  if (next.status !== current.status) {
    const labels = { pendiente: 'pendiente', en_curso: 'en curso', bloqueada: 'bloqueada', hecha: 'terminada' }
    note(req, 'task', id, 'status', `Marcó “${next.title}” como ${labels[next.status]}`)
  } else {
    note(req, 'task', id, 'update', `Actualizó la actividad “${next.title}”`)
  }
  broadcast()
  res.json({ task: taskDetail(id) })
})

app.delete('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id)
  const current = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
  if (!current) return res.status(404).json({ error: 'Actividad no encontrada' })
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  note(req, 'task', id, 'delete', `Eliminó la actividad “${current.title}”`)
  broadcast()
  res.json({ ok: true })
})

app.post('/api/tasks/:id/checklist', (req, res) => {
  const id = Number(req.params.id)
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
  if (!task) return res.status(404).json({ error: 'Actividad no encontrada' })
  const title = text(req.body?.title)
  if (!title) return res.status(400).json({ error: 'Escribe el nombre del paso' })
  const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM checklist_items WHERE task_id = ?').get(id).p
  const result = db
    .prepare('INSERT INTO checklist_items (task_id, title, done, position) VALUES (?, ?, 0, ?)')
    .run(id, title, position)
  broadcast()
  res.status(201).json({ item: plain(db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(Number(result.lastInsertRowid))) })
})

app.patch('/api/checklist/:id', (req, res) => {
  const id = Number(req.params.id)
  const current = db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(id)
  if (!current) return res.status(404).json({ error: 'Paso no encontrado' })
  const body = req.body || {}
  const done = body.done === undefined ? current.done : body.done ? 1 : 0
  const title = text(body.title, current.title) || current.title
  const who = actor(req)
  db.prepare('UPDATE checklist_items SET title=?, done=?, done_by=?, done_at=? WHERE id=?').run(
    title,
    done,
    done ? who.id : null,
    done ? nowIso() : null,
    id,
  )
  const task = db.prepare('SELECT title FROM tasks WHERE id = ?').get(current.task_id)
  note(
    req,
    'task',
    current.task_id,
    'checklist',
    `${done ? 'Completó' : 'Reabrió'} el paso “${title}” de “${task?.title || ''}”`,
  )
  broadcast()
  res.json({ item: plain(db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(id)) })
})

app.delete('/api/checklist/:id', (req, res) => {
  const id = Number(req.params.id)
  const current = db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(id)
  if (!current) return res.status(404).json({ error: 'Paso no encontrado' })
  db.prepare('DELETE FROM checklist_items WHERE id = ?').run(id)
  broadcast()
  res.json({ ok: true })
})

// ---------- task options & photo scouting & voting ----------

function optionDetail(id) {
  const opt = db.prepare('SELECT * FROM task_options WHERE id = ?').get(id)
  if (!opt) return null
  const votes = db
    .prepare('SELECT member_id FROM task_option_votes WHERE option_id = ? ORDER BY created_at ASC')
    .all(id)
    .map((r) => r.member_id)
  return {
    ...plain(opt),
    votes,
    vote_count: votes.length,
  }
}

app.post('/api/tasks/:id/options', (req, res) => {
  const taskId = Number(req.params.id)
  const task = db.prepare('SELECT id, title FROM tasks WHERE id = ?').get(taskId)
  if (!task) return res.status(404).json({ error: 'Actividad no encontrada' })
  const body = req.body || {}
  const title = text(body.title)
  if (!title) return res.status(400).json({ error: 'Escribe el nombre del proveedor u opción' })
  const who = actor(req)
  const price = Math.max(0, num(body.price, 0))
  const detail = text(body.detail)
  const imageUrl = typeof body.image_url === 'string' ? body.image_url.trim() : ''

  const result = db
    .prepare(
      `INSERT INTO task_options (task_id, title, detail, price, image_url, created_by, created_by_name, is_winner, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .run(taskId, title, detail, price, imageUrl, who.id, who.name, nowIso())

  const optId = Number(result.lastInsertRowid)
  note(req, 'task', taskId, 'option', `Subió la opción “${title}” ${imageUrl ? 'con foto ' : ''}para “${task.title}”`)
  broadcast()
  res.status(201).json({ option: optionDetail(optId) })
})

app.post('/api/options/:id/vote', (req, res) => {
  const optionId = Number(req.params.id)
  const opt = db
    .prepare('SELECT o.*, t.title AS task_title FROM task_options o JOIN tasks t ON t.id = o.task_id WHERE o.id = ?')
    .get(optionId)
  if (!opt) return res.status(404).json({ error: 'Opción no encontrada' })
  const who = actor(req)
  if (!who.id) return res.status(400).json({ error: 'Elige quién eres arriba para poder votar' })

  const existing = db
    .prepare('SELECT 1 FROM task_option_votes WHERE option_id = ? AND member_id = ?')
    .get(optionId, who.id)
  let voted = false
  if (existing) {
    db.prepare('DELETE FROM task_option_votes WHERE option_id = ? AND member_id = ?').run(optionId, who.id)
    voted = false
  } else {
    db.prepare('INSERT INTO task_option_votes (option_id, member_id, created_at) VALUES (?, ?, ?)').run(
      optionId,
      who.id,
      nowIso(),
    )
    voted = true
  }

  note(
    req,
    'task',
    opt.task_id,
    'vote',
    `${voted ? 'Votó por' : 'Quitó su voto de'} la opción “${opt.title}” de “${opt.task_title}”`,
  )
  broadcast()
  res.json({ ok: true, option: optionDetail(optionId) })
})

app.patch('/api/options/:id/winner', (req, res) => {
  const optionId = Number(req.params.id)
  const opt = db
    .prepare('SELECT o.*, t.title AS task_title FROM task_options o JOIN tasks t ON t.id = o.task_id WHERE o.id = ?')
    .get(optionId)
  if (!opt) return res.status(404).json({ error: 'Opción no encontrada' })
  const isWinner = req.body?.is_winner ? 1 : 0

  if (isWinner) {
    db.prepare('UPDATE task_options SET is_winner = 0 WHERE task_id = ?').run(opt.task_id)
  }
  db.prepare('UPDATE task_options SET is_winner = ? WHERE id = ?').run(isWinner, optionId)

  note(
    req,
    'task',
    opt.task_id,
    'option_winner',
    isWinner
      ? `Eligió la opción “${opt.title}” como ganadora para “${opt.task_title}”`
      : `Quitó a “${opt.title}” como opción ganadora`,
  )
  broadcast()
  res.json({ ok: true, option: optionDetail(optionId) })
})

app.delete('/api/options/:id', (req, res) => {
  const optionId = Number(req.params.id)
  const opt = db
    .prepare('SELECT o.*, t.title AS task_title FROM task_options o JOIN tasks t ON t.id = o.task_id WHERE o.id = ?')
    .get(optionId)
  if (!opt) return res.status(404).json({ error: 'Opción no encontrada' })
  db.prepare('DELETE FROM task_options WHERE id = ?').run(optionId)
  note(req, 'task', opt.task_id, 'option_delete', `Eliminó la opción “${opt.title}” de “${opt.task_title}”`)
  broadcast()
  res.json({ ok: true })
})

// ---------- agreements ----------

app.get('/api/agreements', (_req, res) => res.json(db.prepare('SELECT * FROM agreements ORDER BY id').all().map(plain)))

app.post('/api/agreements', (req, res) => {
  const body = req.body || {}
  const title = text(body.title)
  if (!title) return res.status(400).json({ error: 'El acuerdo necesita un título' })
  const result = db
    .prepare(
      `INSERT INTO agreements (title, detail, status, owner_id, due_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      title,
      text(body.detail),
      oneOf(body.status, AGREEMENT_STATUS, 'propuesto'),
      memberOrNull(body.owner_id),
      dateOrNull(body.due_date),
      nowIso(),
      nowIso(),
    )
  const id = Number(result.lastInsertRowid)
  note(req, 'agreement', id, 'create', `Registró el acuerdo “${title}”`)
  broadcast()
  res.status(201).json({ agreement: plain(db.prepare('SELECT * FROM agreements WHERE id = ?').get(id)) })
})

app.patch('/api/agreements/:id', (req, res) => {
  const id = Number(req.params.id)
  const current = db.prepare('SELECT * FROM agreements WHERE id = ?').get(id)
  if (!current) return res.status(404).json({ error: 'Acuerdo no encontrado' })
  const body = req.body || {}
  const next = {
    title: text(body.title, current.title) || current.title,
    detail: body.detail === undefined ? current.detail : text(body.detail),
    status: oneOf(body.status, AGREEMENT_STATUS, current.status),
    owner_id: body.owner_id === undefined ? current.owner_id : memberOrNull(body.owner_id),
    due_date: body.due_date === undefined ? current.due_date : dateOrNull(body.due_date),
  }
  db.prepare('UPDATE agreements SET title=?, detail=?, status=?, owner_id=?, due_date=?, updated_at=? WHERE id=?').run(
    next.title,
    next.detail,
    next.status,
    next.owner_id,
    next.due_date,
    nowIso(),
    id,
  )
  const labels = { propuesto: 'propuesto', acordado: 'acordado', cumplido: 'cumplido' }
  note(
    req,
    'agreement',
    id,
    next.status !== current.status ? 'status' : 'update',
    next.status !== current.status
      ? `Marcó el acuerdo “${next.title}” como ${labels[next.status]}`
      : `Actualizó el acuerdo “${next.title}”`,
  )
  broadcast()
  res.json({ agreement: plain(db.prepare('SELECT * FROM agreements WHERE id = ?').get(id)) })
})

app.delete('/api/agreements/:id', (req, res) => {
  const id = Number(req.params.id)
  const current = db.prepare('SELECT * FROM agreements WHERE id = ?').get(id)
  if (!current) return res.status(404).json({ error: 'Acuerdo no encontrado' })
  db.prepare('DELETE FROM agreements WHERE id = ?').run(id)
  note(req, 'agreement', id, 'delete', `Eliminó el acuerdo “${current.title}”`)
  broadcast()
  res.json({ ok: true })
})

// ---------- budget ----------

app.get('/api/budget', (_req, res) => res.json(db.prepare('SELECT * FROM budget_items ORDER BY id').all().map(plain)))

app.post('/api/budget', (req, res) => {
  const body = req.body || {}
  const concept = text(body.concept)
  if (!concept) return res.status(400).json({ error: 'Escribe el concepto del movimiento' })
  const result = db
    .prepare(
      `INSERT INTO budget_items (kind, concept, amount, status, owner_id, due_date, note, receipt_url, category, stage, plan_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      oneOf(body.kind, ['ingreso', 'gasto'], 'gasto'),
      concept,
      Math.max(0, num(body.amount, 0)),
      oneOf(body.status, BUDGET_STATUS, 'pendiente'),
      memberOrNull(body.owner_id),
      dateOrNull(body.due_date),
      text(body.note),
      imageData(body.receipt_url),
      oneOf(body.category, BUDGET_CATEGORY, ''),
      oneOf(body.stage, BUDGET_STAGE, 'real'),
      oneOf(body.stage, BUDGET_STAGE, 'real') === 'real' ? planOrNull(body.plan_id) : null,
      nowIso(),
    )
  const id = Number(result.lastInsertRowid)
  const amountText = `S/ ${Math.max(0, num(body.amount, 0)).toFixed(2)}`
  note(
    req,
    'budget',
    id,
    'create',
    body.category === 'cuota'
      ? `Subió la constancia de “${concept}” (${amountText})`
      : `Registró “${concept}” en el presupuesto (${amountText})`,
  )
  broadcast()
  res.status(201).json({ item: plain(db.prepare('SELECT * FROM budget_items WHERE id = ?').get(id)) })
})

app.patch('/api/budget/:id', (req, res) => {
  const id = Number(req.params.id)
  const current = db.prepare('SELECT * FROM budget_items WHERE id = ?').get(id)
  if (!current) return res.status(404).json({ error: 'Movimiento no encontrado' })
  const body = req.body || {}
  const next = {
    kind: oneOf(body.kind, ['ingreso', 'gasto'], current.kind),
    concept: text(body.concept, current.concept) || current.concept,
    amount: body.amount === undefined ? current.amount : Math.max(0, num(body.amount, current.amount)),
    status: oneOf(body.status, BUDGET_STATUS, current.status),
    owner_id: body.owner_id === undefined ? current.owner_id : memberOrNull(body.owner_id),
    due_date: body.due_date === undefined ? current.due_date : dateOrNull(body.due_date),
    note: body.note === undefined ? current.note : text(body.note),
    receipt_url: imageData(body.receipt_url, current.receipt_url || ''),
    category: body.category === undefined ? current.category || '' : oneOf(body.category, BUDGET_CATEGORY, ''),
    stage: oneOf(body.stage, BUDGET_STAGE, current.stage || 'real'),
    plan_id: body.plan_id === undefined ? current.plan_id : planOrNull(body.plan_id),
  }
  if (next.stage === 'plan' || next.plan_id === id) next.plan_id = null
  // Si cambia el monto o la foto, la validación anterior ya no aplica.
  const revalidate = next.amount !== current.amount || next.receipt_url !== (current.receipt_url || '')
  db.prepare(
    'UPDATE budget_items SET kind=?, concept=?, amount=?, status=?, owner_id=?, due_date=?, note=?, receipt_url=?, category=?, stage=?, plan_id=? WHERE id=?',
  ).run(
    next.kind,
    next.concept,
    next.amount,
    next.status,
    next.owner_id,
    next.due_date,
    next.note,
    next.receipt_url,
    next.category,
    next.stage,
    next.plan_id,
    id,
  )
  if (revalidate) db.prepare('UPDATE budget_items SET validated_by=NULL, validated_at=NULL WHERE id=?').run(id)
  note(req, 'budget', id, 'update', `Actualizó “${next.concept}” en el presupuesto`)
  broadcast()
  res.json({ item: plain(db.prepare('SELECT * FROM budget_items WHERE id = ?').get(id)) })
})

app.get('/api/budget/:id/receipt', (req, res) => {
  const row = db.prepare('SELECT receipt_url FROM budget_items WHERE id = ?').get(Number(req.params.id))
  if (!row) return res.status(404).json({ error: 'Movimiento no encontrado' })
  res.setHeader('Cache-Control', 'private, max-age=300')
  res.json({ receipt_url: row.receipt_url || '' })
})

// Cualquier integrante puede validar una constancia después de verla.
app.post('/api/budget/:id/validate', (req, res) => {
  const id = Number(req.params.id)
  const current = db.prepare('SELECT * FROM budget_items WHERE id = ?').get(id)
  if (!current) return res.status(404).json({ error: 'Movimiento no encontrado' })
  const who = actor(req)
  const undo = req.body?.validated === false
  if (!undo && !who.id) return res.status(400).json({ error: 'Elige tu imán para validar' })
  db.prepare('UPDATE budget_items SET validated_by=?, validated_at=? WHERE id=?').run(
    undo ? null : who.id,
    undo ? null : nowIso(),
    id,
  )
  note(
    req,
    'budget',
    id,
    'validate',
    undo ? `Quitó la validación de “${current.concept}”` : `Validó la constancia de “${current.concept}” (S/ ${Number(current.amount).toFixed(2)})`,
  )
  broadcast()
  res.json({ ok: true })
})

app.delete('/api/budget/:id', (req, res) => {
  const id = Number(req.params.id)
  const current = db.prepare('SELECT * FROM budget_items WHERE id = ?').get(id)
  if (!current) return res.status(404).json({ error: 'Movimiento no encontrado' })
  db.prepare('DELETE FROM budget_items WHERE id = ?').run(id)
  note(req, 'budget', id, 'delete', `Eliminó “${current.concept}” del presupuesto`)
  broadcast()
  res.json({ ok: true })
})

// ---------- OCR & quote image scraping ----------

app.post('/api/ocr/scrape', async (req, res) => {
  const image = req.body?.image
  if (!image) return res.status(400).json({ error: 'Falta la imagen para escanear' })
  try {
    const result = await scrapeQuoteImage(image)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: 'Error al escanear la imagen', details: err.message })
  }
})


// ---------- activity log / live alerts & kudos ----------

app.post('/api/activity', (req, res) => {
  const body = req.body || {}
  const detail = text(body.detail)
  if (!detail) return res.status(400).json({ error: 'Detalle requerido' })
  const entity = text(body.entity, 'general')
  const action = text(body.action, 'nota')
  const entityId = body.entityId ? Number(body.entityId) : null
  note(req, entity, entityId, action, detail)
  broadcast()
  res.json({ ok: true })
})

// ---------- presence & traffic tracking (solo coordinación) ----------

app.post('/api/presence', (req, res) => {
  const who = actor(req)
  if (who.id) {
    const viewName = text(req.body?.view, 'Pizarra')
    touchPresence(who.id, who.name, req.get('user-agent'), viewName)
  }
  res.json({ ok: true })
})

app.get('/api/presence/stats', (req, res) => {
  const members = listMembers()
  const presenceList = db.prepare('SELECT * FROM member_presence').all().map(plain)
  const presenceMap = new Map(presenceList.map((p) => [p.member_id, p]))

  const actionsList = db
    .prepare('SELECT actor_id, COUNT(*) as c FROM activity_log WHERE actor_id IS NOT NULL GROUP BY actor_id')
    .all()
  const actionsMap = new Map(actionsList.map((a) => [a.actor_id, a.c]))

  const now = Date.now()
  const ONLINE_THRESHOLD_MS = 2.5 * 60 * 1000 // 2.5 minutos
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayMs = todayStart.getTime()

  let onlineCount = 0
  let activeTodayCount = 0
  let neverCount = 0

  const memberStats = members.map((m) => {
    const p = presenceMap.get(m.id)
    const lastSeenMs = p ? new Date(p.last_seen_at).getTime() : 0
    const isOnline = lastSeenMs > 0 && now - lastSeenMs <= ONLINE_THRESHOLD_MS
    const isToday = lastSeenMs >= todayMs

    if (isOnline) onlineCount++
    if (isToday) activeTodayCount++
    if (!p) neverCount++

    return {
      id: m.id,
      name: m.name,
      color: m.color,
      role: m.role,
      is_lead: m.is_lead,
      is_online: isOnline,
      last_seen_at: p?.last_seen_at || null,
      device: p?.device || 'Desconocido',
      total_visits: p?.total_visits || 0,
      last_view: p?.last_view || '',
      actions_count: actionsMap.get(m.id) || 0,
    }
  })

  const recentViews = db.prepare('SELECT * FROM page_views ORDER BY id DESC LIMIT 20').all().map(plain)

  res.json({
    summary: {
      total: members.length,
      online: onlineCount,
      active_today: activeTodayCount,
      never: neverCount,
    },
    members: memberStats,
    recent_views: recentViews,
  })
})

// ---------- import / export ----------

app.get('/api/export', (_req, res) => {
  // El respaldo sí incluye las fotos de constancias.
  const payload = { ...getBootstrap(), budget: listBudget({ full: true }) }
  res.setHeader('Content-Disposition', `attachment; filename="alfin-desayuno-${new Date().toISOString().slice(0, 10)}.json"`)
  res.json(payload)
})

app.post('/api/import', (req, res) => {
  const data = req.body
  if (!data || !Array.isArray(data.members) || !Array.isArray(data.tasks)) {
    return res.status(400).json({ error: 'El archivo no tiene el formato esperado' })
  }
  db.exec('BEGIN')
  try {
    db.exec(`
      DELETE FROM task_option_votes;
      DELETE FROM task_options;
      DELETE FROM task_assignees;
      DELETE FROM checklist_items;
      DELETE FROM tasks;
      DELETE FROM agreements;
      DELETE FROM budget_items;
      DELETE FROM activity_log;
      DELETE FROM members;
    `)
    const insertMember = db.prepare(
      `INSERT INTO members (id, name, role, area, phone, email, color, is_lead, photo_url, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    data.members.forEach((member, index) => {
      insertMember.run(
        Number(member.id) || index + 1,
        text(member.name, 'Integrante'),
        text(member.role),
        text(member.area),
        text(member.phone),
        text(member.email),
        text(member.color) || '#E4572E',
        member.is_lead ? 1 : 0,
        imageData(member.photo_url),
        index,
        nowIso(),
      )
    })
    const insertTask = db.prepare(
      `INSERT INTO tasks (id, title, detail, area, status, priority, due_date, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const insertAssignee = db.prepare('INSERT OR IGNORE INTO task_assignees (task_id, member_id) VALUES (?, ?)')
    const insertCheck = db.prepare(
      'INSERT INTO checklist_items (task_id, title, done, position) VALUES (?, ?, ?, ?)',
    )
    const insertOption = db.prepare(
      `INSERT INTO task_options (id, task_id, title, detail, price, image_url, created_by, created_by_name, is_winner, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const insertVote = db.prepare('INSERT OR IGNORE INTO task_option_votes (option_id, member_id, created_at) VALUES (?, ?, ?)')

    data.tasks.forEach((task, index) => {
      const taskId = Number(task.id) || index + 1
      insertTask.run(
        taskId,
        text(task.title, 'Actividad'),
        text(task.detail),
        text(task.area) || AREAS[0],
        oneOf(task.status, TASK_STATUS, 'pendiente'),
        oneOf(task.priority, PRIORITY, 'media'),
        dateOrNull(task.due_date),
        index,
        nowIso(),
        nowIso(),
      )
      ;(task.assignees || []).forEach((memberId) => insertAssignee.run(taskId, Number(memberId)))
      ;(task.checklist || []).forEach((item, itemIndex) => {
        insertCheck.run(taskId, text(item.title), item.done ? 1 : 0, itemIndex)
      })
      ;(task.options || []).forEach((opt, optIndex) => {
        const optId = Number(opt.id) || Number(`${taskId}${optIndex + 1}`)
        insertOption.run(
          optId,
          taskId,
          text(opt.title, 'Opción'),
          text(opt.detail),
          Math.max(0, num(opt.price, 0)),
          typeof opt.image_url === 'string' ? opt.image_url : '',
          memberOrNull(opt.created_by),
          text(opt.created_by_name),
          opt.is_winner ? 1 : 0,
          opt.created_at || nowIso(),
        )
        ;(opt.votes || []).forEach((voterId) => {
          insertVote.run(optId, Number(voterId), nowIso())
        })
      })
    })
    const insertAgreement = db.prepare(
      `INSERT INTO agreements (id, title, detail, status, owner_id, due_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    ;(data.agreements || []).forEach((agreement, index) => {
      insertAgreement.run(
        Number(agreement.id) || index + 1,
        text(agreement.title, 'Acuerdo'),
        text(agreement.detail),
        oneOf(agreement.status, AGREEMENT_STATUS, 'propuesto'),
        agreement.owner_id ? Number(agreement.owner_id) : null,
        dateOrNull(agreement.due_date),
        nowIso(),
        nowIso(),
      )
    })
    const insertBudget = db.prepare(
      `INSERT INTO budget_items (id, kind, concept, amount, status, owner_id, due_date, note, receipt_url, category, validated_by, validated_at, stage, plan_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    ;(data.budget || []).forEach((item, index) => {
      insertBudget.run(
        Number(item.id) || index + 1,
        oneOf(item.kind, ['ingreso', 'gasto'], 'gasto'),
        text(item.concept, 'Movimiento'),
        Math.max(0, num(item.amount, 0)),
        oneOf(item.status, BUDGET_STATUS, 'pendiente'),
        item.owner_id ? Number(item.owner_id) : null,
        dateOrNull(item.due_date),
        text(item.note),
        imageData(item.receipt_url),
        oneOf(item.category, BUDGET_CATEGORY, ''),
        item.validated_by ? Number(item.validated_by) : null,
        item.validated_at ? text(item.validated_at) : null,
        // Respaldos antiguos sin etapa: lo pendiente y sin constancia es presupuesto inicial.
        oneOf(item.stage, BUDGET_STAGE, item.status !== 'hecho' && !item.receipt_url && !item.category ? 'plan' : 'real'),
        item.plan_id ? Number(item.plan_id) : null,
        item.created_at ? text(item.created_at) : nowIso(),
      )
    })
    if (data.settings) {
      db.prepare(
        `UPDATE settings SET event_name=?, event_date=?, event_time=?, location=?, guests=?, team_size=?, note=?, updated_at=? WHERE id=1`,
      ).run(
        text(data.settings.event_name, 'Al Fin Desayuno') || 'Al Fin Desayuno',
        dateOrNull(data.settings.event_date) ?? '',
        text(data.settings.event_time, '08:30'),
        text(data.settings.location),
        Math.max(1, Math.round(num(data.settings.guests, 80))),
        Math.max(1, Math.round(num(data.settings.team_size, 16))),
        text(data.settings.note),
        nowIso(),
      )
    }
    note(req, 'app', null, 'import', 'Importó una copia de seguridad')
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    return res.status(400).json({ error: `No se pudo importar: ${error.message}` })
  }
  broadcast()
  res.json(getBootstrap())
})

// Si el celular comparte antes de que la app quede instalada en caché, al menos abre Presupuesto.
app.post('/compartir', (_req, res) => res.redirect(303, '/#/presupuesto'))

// ---------- static ----------

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false }))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
    res.sendFile(path.join(DIST, 'index.html'))
  })
}

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: err?.message || 'Error del servidor' })
})

app.listen(PORT, HOST, () => {
  console.log(`[alfin] API y web en http://localhost:${PORT}`)
  console.log(TEAM_CODE ? '[alfin] Acceso protegido con código del equipo' : '[alfin] Sin código de acceso (define TEAM_CODE para protegerla)')
})
