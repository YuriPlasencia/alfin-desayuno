import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { DATA_DIR, SLUG_PATTERN, db, eventDbPath, getSettings, nowIso, plain, runInEvent } from './db.js'

/*
 * Juntada: la plataforma. Guarda las cuentas (Google), los eventos con su código
 * y quién pertenece a cada evento (y qué imán es). Los datos de cada evento viven
 * en su propia base (ver db.js).
 */
export const pdb = new DatabaseSync(path.join(DATA_DIR, 'juntada.db'))

pdb.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_sub TEXT UNIQUE,
    email TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    picture TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    last_login_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    code_hash TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS event_users (
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    member_id INTEGER,
    joined_at TEXT NOT NULL,
    PRIMARY KEY (event_id, user_id)
  );
`)

// ---------- secreto de sesión (se genera una vez y queda en la base) ----------

export function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET
  const row = pdb.prepare("SELECT value FROM meta WHERE key = 'session_secret'").get()
  if (row) return row.value
  const secret = crypto.randomBytes(32).toString('hex')
  pdb.prepare("INSERT INTO meta (key, value) VALUES ('session_secret', ?)").run(secret)
  return secret
}

// ---------- códigos de evento (se guardan cifrados) ----------

const normalizeCode = (code) => String(code || '').trim().toLowerCase()

export function hashCode(code) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(normalizeCode(code), salt, 32).toString('hex')
  return `${salt}:${hash}`
}

export function verifyCode(code, stored) {
  const [salt, hash] = String(stored || '').split(':')
  if (!salt || !hash) return false
  const candidate = crypto.scryptSync(normalizeCode(code), salt, 32)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)
}

// ---------- usuarios ----------

export function upsertGoogleUser({ sub, email, name, picture }) {
  const now = nowIso()
  const existing = pdb.prepare('SELECT id FROM users WHERE google_sub = ?').get(sub)
  if (existing) {
    pdb.prepare('UPDATE users SET email = ?, name = ?, picture = ?, last_login_at = ? WHERE id = ?').run(email, name, picture, now, existing.id)
    return existing.id
  }
  const result = pdb
    .prepare('INSERT INTO users (google_sub, email, name, picture, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(sub, email, name, picture, now, now)
  return Number(result.lastInsertRowid)
}

export function getUser(id) {
  return plain(pdb.prepare('SELECT id, email, name, picture FROM users WHERE id = ?').get(id))
}

// ---------- eventos ----------

export function getEvent(slug) {
  return plain(pdb.prepare('SELECT * FROM events WHERE slug = ?').get(slug))
}

export function membership(slug, userId) {
  return plain(
    pdb
      .prepare(
        `SELECT eu.role, eu.member_id, e.id AS event_id FROM event_users eu
         JOIN events e ON e.id = eu.event_id WHERE e.slug = ? AND eu.user_id = ?`,
      )
      .get(slug, userId),
  )
}

/** Nombre, fecha y lugar del evento (los lee de su propia base). */
export function eventSummary(slug) {
  return runInEvent(slug, () => {
    const s = getSettings()
    return { slug, name: s.event_name, date: s.event_date, time: s.event_time, location: s.location }
  })
}

export function listUserEvents(userId) {
  return pdb
    .prepare(
      `SELECT e.slug, eu.role FROM event_users eu JOIN events e ON e.id = eu.event_id
       WHERE eu.user_id = ? ORDER BY eu.joined_at DESC`,
    )
    .all(userId)
    .map((row) => ({ ...eventSummary(row.slug), role: row.role }))
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function slugify(name, date) {
  const base = String(name || 'evento')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'evento'
  const [year, month] = String(date || '').split('-')
  const suffix = year && month ? `-${MONTHS[Number(month) - 1] || month}-${year}` : ''
  let slug = `${base}${suffix}`.replace(/-+/g, '-').slice(0, 60).replace(/-+$/, '')
  let n = 2
  while (getEvent(slug) || fs.existsSync(eventDbPath(slug))) slug = `${base}${suffix}-${n++}`.slice(0, 60)
  return SLUG_PATTERN.test(slug) ? slug : `evento-${Date.now()}`
}

/** Crea el evento con su base vacía; quien lo crea queda como organizador y primer imán. */
export function createEvent({ name, date, time, location, guests, code, user }) {
  const slug = slugify(name, date)
  const now = nowIso()
  const memberId = runInEvent(slug, () => {
    getSettings()
    db.prepare(
      'UPDATE settings SET event_name = ?, event_date = ?, event_time = ?, location = ?, guests = ?, team_size = 1, updated_at = ? WHERE id = 1',
    ).run(name, date || '', time || '', location || '', Math.max(1, Math.round(Number(guests) || 20)), now)
    return addMemberFor(user, { role: 'Organiza el evento', lead: true })
  })
  const result = pdb
    .prepare('INSERT INTO events (slug, code_hash, created_by, created_at) VALUES (?, ?, ?, ?)')
    .run(slug, hashCode(code), user.id, now)
  pdb
    .prepare("INSERT INTO event_users (event_id, user_id, role, member_id, joined_at) VALUES (?, ?, 'admin', ?, ?)")
    .run(Number(result.lastInsertRowid), user.id, memberId, now)
  return slug
}

const COLORS = ['#1D3FBF', '#E4572E', '#2F8F5B', '#D98E04', '#8B5CF6', '#0E7490', '#C2412D', '#DB2777', '#3B6EA5', '#A16207']

/** Crea el imán de una cuenta dentro del evento en curso (debe llamarse dentro de runInEvent). */
export function addMemberFor(user, { role = '', lead = false } = {}) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM members').get().n
  const result = db
    .prepare(
      `INSERT INTO members (name, role, area, phone, email, color, is_lead, photo_url, position, created_at)
       VALUES (?, ?, '', '', ?, ?, ?, ?, ?, ?)`,
    )
    .run(user.name || user.email || 'Integrante', role, user.email || '', COLORS[count % COLORS.length], lead ? 1 : 0, user.picture || '', count, nowIso())
  return Number(result.lastInsertRowid)
}

export function joinEvent(slug, user) {
  const event = getEvent(slug)
  if (!event) return null
  const now = nowIso()
  const hasMembers = pdb.prepare('SELECT COUNT(*) AS n FROM event_users WHERE event_id = ?').get(event.id).n > 0
  pdb
    .prepare('INSERT OR IGNORE INTO event_users (event_id, user_id, role, member_id, joined_at) VALUES (?, ?, ?, NULL, ?)')
    .run(event.id, user.id, hasMembers ? 'member' : 'admin', now)
  return membership(slug, user.id)
}

export function setMemberLink(slug, userId, memberId) {
  const event = getEvent(slug)
  pdb.prepare('UPDATE event_users SET member_id = ? WHERE event_id = ? AND user_id = ?').run(memberId, event.id, userId)
}

/** Imanes del evento ya ligados a alguna cuenta (para no ofrecerlos dos veces). */
export function claimedMembers(slug) {
  const event = getEvent(slug)
  if (!event) return []
  return pdb
    .prepare('SELECT member_id FROM event_users WHERE event_id = ? AND member_id IS NOT NULL')
    .all(event.id)
    .map((row) => row.member_id)
}

export function setEventCode(slug, code) {
  pdb.prepare('UPDATE events SET code_hash = ? WHERE slug = ?').run(hashCode(code), slug)
}

/**
 * Primera vez con Juntada: la base de Al Fin Desayuno (data/alfin.db) pasa a ser
 * el primer evento, con el código de equipo que ya usaban (TEAM_CODE).
 */
export function migrateLegacy() {
  const legacy = path.join(DATA_DIR, 'alfin.db')
  const already = pdb.prepare('SELECT COUNT(*) AS n FROM events').get().n > 0
  if (already || !fs.existsSync(legacy)) return null
  const slug = 'al-fin-desayuno-octubre-2026'
  // Se vuelca el WAL al archivo principal antes de copiarlo.
  const old = new DatabaseSync(legacy)
  old.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  old.close()
  if (!fs.existsSync(eventDbPath(slug))) fs.copyFileSync(legacy, eventDbPath(slug))
  const code = String(process.env.TEAM_CODE || '').trim() || crypto.randomBytes(4).toString('hex')
  pdb.prepare('INSERT INTO events (slug, code_hash, created_by, created_at) VALUES (?, ?, NULL, ?)').run(slug, hashCode(code), nowIso())
  return { slug, code, generated: !process.env.TEAM_CODE }
}

/** Al retirar a un integrante, su cuenta queda sin imán (puede elegir otro o crear uno). */
export function clearMemberLink(slug, memberId) {
  const event = getEvent(slug)
  if (event) pdb.prepare('UPDATE event_users SET member_id = NULL WHERE event_id = ? AND member_id = ?').run(event.id, memberId)
}

/** Registra un evento cuya base ya existe (datos de ejemplo, pruebas). */
export function registerEvent(slug, code) {
  if (getEvent(slug)) return
  pdb.prepare('INSERT INTO events (slug, code_hash, created_by, created_at) VALUES (?, ?, NULL, ?)').run(slug, hashCode(code), nowIso())
}
