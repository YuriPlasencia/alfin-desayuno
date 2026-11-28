import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { DATA_DIR, SLUG_PATTERN, db, eventDbPath, getSettings, nowIso, plain, runInEvent } from './db.js'
import { openSecretGame } from './secreto.js'

/** Tipos de evento que se eligen al crearlo. */
export const EVENT_TYPES = ['desayuno', 'almuerzo', 'cena', 'cumpleanos', 'paseo', 'fiesta', 'partido', 'secreto', 'mes', 'viaje', 'ahorro']
/** Para qué se usa el evento (se elige en la portada). */
export const EVENT_CATEGORIES = ['trabajo', 'familiar', 'entretenimiento', 'finanzas']

/*
 * Juntay: la plataforma. Guarda las cuentas (Google), los eventos con su código
 * y quién pertenece a cada evento (y qué imán es). Los datos de cada evento viven
 * en su propia base (ver db.js).
 */
const PLATFORM_DB = path.join(DATA_DIR, 'juntay.db')
migratePlatformFile(path.join(DATA_DIR, 'juntada.db'), PLATFORM_DB)
export const pdb = new DatabaseSync(PLATFORM_DB)

/**
 * Antes la base se llamaba juntada.db (nombre anterior, Juntada). La primera vez que arranca
 * con el nombre nuevo, vuelca el WAL al archivo principal y lo renombra a juntay.db, con todo
 * lo que tenía (también en el disco de Render).
 */
function migratePlatformFile(oldPath, newPath) {
  if (fs.existsSync(newPath) || !fs.existsSync(oldPath)) return
  const old = new DatabaseSync(oldPath)
  old.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  old.close()
  fs.renameSync(oldPath, newPath)
  // El WAL ya quedó vacío; se borran los restos del nombre viejo.
  for (const suffix of ['-wal', '-shm']) fs.rmSync(oldPath + suffix, { force: true })
  console.log('[juntay] La base juntada.db pasó a llamarse juntay.db.')
}

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

// Permiso para recibir novedades (desmarcado por defecto) y correo comprobado con un código.
for (const [column, definition] of [
  ['news_opt_in', 'INTEGER NOT NULL DEFAULT 0'],
  ['consent_at', 'TEXT'],
  ['email_verified', 'INTEGER NOT NULL DEFAULT 0'],
]) {
  if (!pdb.prepare('PRAGMA table_info(users)').all().some((col) => col.name === column)) {
    pdb.exec(`ALTER TABLE users ADD COLUMN ${column} ${definition};`)
  }
}

// Historial de cada persona en Juntay: ingresos, eventos creados, uniones y lo que hace en cada evento.
pdb.exec(`
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    kind TEXT NOT NULL,
    slug TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS history_user ON history (user_id, at);
`)
// Desde cuándo se guarda el historial: lo anterior se reconstruye de los datos que ya había.
if (!pdb.prepare("SELECT 1 FROM meta WHERE key = 'history_since'").get()) {
  pdb.prepare("INSERT INTO meta (key, value) VALUES ('history_since', ?)").run(nowIso())
}
export const historySince = () => pdb.prepare("SELECT value FROM meta WHERE key = 'history_since'").get().value

/** Anota un hecho en el historial de la persona (nunca rompe la acción que lo origina). */
export function recordHistory(userId, kind, slug = '', detail = '') {
  try {
    pdb.prepare('INSERT INTO history (at, user_id, kind, slug, detail) VALUES (?, ?, ?, ?, ?)').run(nowIso(), userId || null, kind, slug, String(detail).slice(0, 500))
  } catch (err) {
    console.error('[historial]', err)
  }
}

// Códigos de acceso enviados por correo (se guardan solo sus huellas, nunca el código).
pdb.exec(`
  CREATE TABLE IF NOT EXISTS login_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    news INTEGER NOT NULL DEFAULT 0,
    code_hash TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    next TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS login_codes_email ON login_codes (email, created_at);
`)
// Para el panel: cuándo un código sirvió para entrar y si el correo no se pudo enviar.
for (const [column, definition] of [
  ['ok_at', 'TEXT'],
  ['send_error', "TEXT NOT NULL DEFAULT ''"],
]) {
  if (!pdb.prepare('PRAGMA table_info(login_codes)').all().some((col) => col.name === column)) {
    pdb.exec(`ALTER TABLE login_codes ADD COLUMN ${column} ${definition};`)
  }
}
if (!pdb.prepare("SELECT 1 FROM meta WHERE key = 'login_stats_since'").get()) {
  pdb.prepare("INSERT INTO meta (key, value) VALUES ('login_stats_since', ?)").run(nowIso())
}

export const isVerified = (userId) => Boolean(pdb.prepare('SELECT email_verified FROM users WHERE id = ?').get(userId)?.email_verified)

/**
 * Entrada con el correo ya comprobado: recupera la cuenta de ese correo o crea una.
 * Si había cuentas antiguas (sin comprobar) con ese correo, se queda con la más usada
 * para que la persona conserve sus eventos.
 */
export function signInVerified({ name, email, newsOptIn }) {
  const now = nowIso()
  const verified = pdb.prepare('SELECT id FROM users WHERE email = ? AND email_verified = 1 ORDER BY last_login_at DESC LIMIT 1').get(email)
  const legacy = verified
    ? null
    : pdb
        .prepare(
          `SELECT u.id FROM users u LEFT JOIN event_users eu ON eu.user_id = u.id
           WHERE u.email = ? GROUP BY u.id ORDER BY COUNT(eu.event_id) DESC, u.last_login_at DESC LIMIT 1`,
        )
        .get(email)
  const existing = verified || legacy
  if (existing) {
    pdb
      .prepare(
        `UPDATE users SET email_verified = 1, last_login_at = ?,
           news_opt_in = CASE WHEN ? THEN 1 ELSE news_opt_in END,
           consent_at = CASE WHEN ? AND news_opt_in = 0 THEN ? ELSE consent_at END
         WHERE id = ?`,
      )
      .run(now, newsOptIn ? 1 : 0, newsOptIn ? 1 : 0, now, existing.id)
    if (legacy) recordHistory(existing.id, 'correo verificado', '', 'Comprobó su correo con el código')
    return existing.id
  }
  const result = pdb
    .prepare(
      'INSERT INTO users (google_sub, email, name, picture, created_at, last_login_at, news_opt_in, consent_at, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
    )
    .run(`correo:${crypto.randomUUID()}`, email, name, '', now, now, newsOptIn ? 1 : 0, newsOptIn ? now : null)
  const id = Number(result.lastInsertRowid)
  recordHistory(id, 'registro', '', 'Se registró con su correo comprobado')
  return id
}

/**
 * Entrada con nombre y correo (sin Google). El correo no se verifica, así que no sirve para
 * recuperar una cuenta: cada entrada crea una cuenta nueva y nadie toma la de otro escribiendo su correo.
 */
export function createNameUser({ name, email, newsOptIn }) {
  const now = nowIso()
  const result = pdb
    .prepare(
      'INSERT INTO users (google_sub, email, name, picture, created_at, last_login_at, news_opt_in, consent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(`nombre:${crypto.randomUUID()}`, email, name, '', now, now, newsOptIn ? 1 : 0, newsOptIn ? now : null)
  const id = Number(result.lastInsertRowid)
  recordHistory(id, 'registro', '', 'Se registró con nombre y correo')
  return id
}

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

export function upsertGoogleUser({ sub, email, name, picture, emailVerified = false }) {
  const now = nowIso()
  const verified = emailVerified ? 1 : 0
  const existing = pdb.prepare('SELECT id FROM users WHERE google_sub = ?').get(sub)
  if (existing) {
    pdb
      .prepare('UPDATE users SET email = ?, name = ?, picture = ?, last_login_at = ?, email_verified = MAX(email_verified, ?) WHERE id = ?')
      .run(email, name, picture, now, verified, existing.id)
    return existing.id
  }
  // Primera vez con Google: si ya tenía una cuenta de nombre o de correo con ese mismo correo
  // (y Google lo da por comprobado), esa cuenta pasa a ser la de Google y conserva sus eventos.
  // Si hay varias, se queda con la de más eventos.
  const legacy =
    emailVerified && email
      ? pdb
          .prepare(
            `SELECT u.id FROM users u LEFT JOIN event_users eu ON eu.user_id = u.id
             WHERE lower(u.email) = lower(?) AND (u.google_sub LIKE 'nombre:%' OR u.google_sub LIKE 'correo:%')
             GROUP BY u.id ORDER BY COUNT(eu.event_id) DESC, u.last_login_at DESC LIMIT 1`,
          )
          .get(email)
      : null
  if (legacy) {
    pdb
      .prepare('UPDATE users SET google_sub = ?, email = ?, name = ?, picture = ?, last_login_at = ?, email_verified = 1 WHERE id = ?')
      .run(sub, email, name, picture, now, legacy.id)
    recordHistory(legacy.id, 'cuenta unida', '', 'Su cuenta pasó a entrar con Google')
    return legacy.id
  }
  const result = pdb
    .prepare('INSERT INTO users (google_sub, email, name, picture, created_at, last_login_at, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(sub, email, name, picture, now, now, verified)
  const id = Number(result.lastInsertRowid)
  recordHistory(id, 'registro', '', 'Se registró con Google')
  return id
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
    return { slug, name: s.event_name, date: s.event_date, time: s.event_time, location: s.location, type: s.event_type || '', category: s.event_category || '' }
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

/** Cuántos eventos organiza esta cuenta (para poner un tope a la creación). */
export function countAdminEvents(userId) {
  return pdb.prepare("SELECT COUNT(*) AS n FROM event_users WHERE user_id = ? AND role = 'admin'").get(userId).n
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
  // Se recorta el nombre, nunca el número: si no, al llegar a cierto contador el bucle no terminaba.
  for (let n = 2; getEvent(slug) || fs.existsSync(eventDbPath(slug)); n++) {
    if (n > 500) return `evento-${Date.now()}`
    const tail = `-${n}`
    slug = `${base}${suffix}`.slice(0, 60 - tail.length).replace(/-+$/, '') + tail
  }
  return SLUG_PATTERN.test(slug) ? slug : `evento-${Date.now()}`
}

/** Crea el evento con su base vacía; quien lo crea queda como organizador y primer imán. */
export function createEvent({ name, date, time, location, guests, code, type = '', category = '', user }) {
  const slug = slugify(name, date)
  const now = nowIso()
  const memberId = runInEvent(slug, () => {
    getSettings()
    db.prepare(
      'UPDATE settings SET event_name = ?, event_date = ?, event_time = ?, location = ?, guests = ?, team_size = 1, event_type = ?, event_category = ?, updated_at = ? WHERE id = 1',
    ).run(name, date || '', time || '', location || '', Math.max(1, Math.round(Number(guests) || 20)), type, category, now)
    const id = addMemberFor(user, { role: 'Organiza el evento', lead: true })
    // Un evento de amigo secreto nace con el juego abierto y su organizador ya apuntado.
    if (type === 'secreto') openSecretGame({ title: name, date, time, place: location, memberId: id, userId: user.id })
    return id
  })
  const result = pdb
    .prepare('INSERT INTO events (slug, code_hash, created_by, created_at) VALUES (?, ?, ?, ?)')
    .run(slug, hashCode(code), user.id, now)
  pdb
    .prepare("INSERT INTO event_users (event_id, user_id, role, member_id, joined_at) VALUES (?, ?, 'admin', ?, ?)")
    .run(Number(result.lastInsertRowid), user.id, memberId, now)
  recordHistory(user.id, 'creó evento', slug, type ? `${name} (${type})` : name)
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
  recordHistory(user.id, 'se unió', slug, 'Entró al evento con el código')
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
 * Primera vez con Juntay (entonces Juntada): la base de Al Fin Desayuno (data/alfin.db) pasa a ser
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
