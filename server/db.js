import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = process.env.DATA_DIR || path.join(here, '..', 'data')

fs.mkdirSync(DATA_DIR, { recursive: true })

export const db = new DatabaseSync(path.join(DATA_DIR, 'alfin.db'))

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    event_name TEXT NOT NULL DEFAULT 'Al Fin Desayuno',
    event_date TEXT NOT NULL DEFAULT '',
    event_time TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    guests INTEGER NOT NULL DEFAULT 80,
    team_size INTEGER NOT NULL DEFAULT 16,
    note TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT '',
    area TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#E4572E',
    is_lead INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    area TEXT NOT NULL DEFAULT 'Coordinación',
    status TEXT NOT NULL DEFAULT 'pendiente',
    priority TEXT NOT NULL DEFAULT 'media',
    due_date TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS task_assignees (
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, member_id)
  );

  CREATE TABLE IF NOT EXISTS checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    done_by INTEGER,
    done_at TEXT
  );

  CREATE TABLE IF NOT EXISTS agreements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'propuesto',
    owner_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
    due_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS budget_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL DEFAULT 'gasto',
    concept TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pendiente',
    owner_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
    due_date TEXT,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER,
    actor_name TEXT NOT NULL DEFAULT '',
    entity TEXT NOT NULL DEFAULT '',
    entity_id INTEGER,
    action TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS task_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL DEFAULT 0,
    image_url TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
    created_by_name TEXT NOT NULL DEFAULT '',
    is_winner INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS task_option_votes (
    option_id INTEGER NOT NULL REFERENCES task_options(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (option_id, member_id)
  );

  CREATE TABLE IF NOT EXISTS member_presence (
    member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
    last_seen_at TEXT NOT NULL,
    device TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    total_visits INTEGER NOT NULL DEFAULT 1,
    last_view TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS page_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
    member_name TEXT NOT NULL DEFAULT '',
    view_name TEXT NOT NULL DEFAULT '',
    device TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
`)

try {
  db.exec('ALTER TABLE settings ADD COLUMN treasurer_id INTEGER REFERENCES members(id);')
} catch {
  /* columna ya existe */
}

try {
  db.exec('ALTER TABLE budget_items ADD COLUMN receipt_url TEXT NOT NULL DEFAULT "";')
} catch {
  /* columna ya existe */
}

// Columnas añadidas después: se agregan solo si faltan.
function addColumn(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((col) => col.name === column)
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`)
}

addColumn('members', 'photo_url', "TEXT NOT NULL DEFAULT ''")
addColumn('budget_items', 'category', "TEXT NOT NULL DEFAULT ''")
addColumn('budget_items', 'validated_by', 'INTEGER REFERENCES members(id) ON DELETE SET NULL')
addColumn('budget_items', 'validated_at', 'TEXT')


export const nowIso = () => new Date().toISOString()

export function plain(row) {
  return row ? { ...row } : row
}

export function logActivity({ actorId = null, actorName = '', entity = '', entityId = null, action = '', detail = '' }) {
  db.prepare(
    `INSERT INTO activity_log (actor_id, actor_name, entity, entity_id, action, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(actorId, actorName, entity, entityId, action, detail, nowIso())
}

export function listLog(limit = 30) {
  return db
    .prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?')
    .all(limit)
    .map(plain)
}

export function getSettings() {
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get()
  if (row) return plain(row)
  const seed = {
    id: 1,
    event_name: 'Al Fin Desayuno',
    event_date: '',
    event_time: '08:30',
    location: '',
    guests: 80,
    team_size: 16,
    note: '',
    treasurer_id: null,
    updated_at: nowIso(),
  }
  db.prepare(
    `INSERT INTO settings (id, event_name, event_date, event_time, location, guests, team_size, note, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(seed.event_name, seed.event_date, seed.event_time, seed.location, seed.guests, seed.team_size, seed.note, seed.updated_at)
  return seed
}

export function listMembers() {
  return db
    .prepare('SELECT * FROM members ORDER BY position ASC, id ASC')
    .all()
    .map(plain)
}

export function listAgreements() {
  return db
    .prepare(
      `SELECT a.*, m.name AS owner_name
       FROM agreements a LEFT JOIN members m ON m.id = a.owner_id
       ORDER BY
         CASE a.status WHEN 'propuesto' THEN 0 WHEN 'acordado' THEN 1 ELSE 2 END,
         COALESCE(a.due_date, '9999-12-31') ASC, a.id ASC`,
    )
    .all()
    .map(plain)
}

export function listChecklist(taskId) {
  return db
    .prepare(
      `SELECT c.*, m.name AS done_by_name
       FROM checklist_items c LEFT JOIN members m ON m.id = c.done_by
       WHERE c.task_id = ? ORDER BY c.position ASC, c.id ASC`,
    )
    .all(taskId)
    .map(plain)
}

export function listTasks() {
  const tasks = db
    .prepare(
      `SELECT t.* FROM tasks t
       ORDER BY
         CASE t.status WHEN 'bloqueada' THEN 0 WHEN 'en_curso' THEN 1 WHEN 'pendiente' THEN 2 ELSE 3 END,
         COALESCE(t.due_date, '9999-12-31') ASC, t.position ASC, t.id ASC`,
    )
    .all()
    .map(plain)

  const assignees = db.prepare('SELECT task_id, member_id FROM task_assignees').all()
  const byTask = new Map()
  for (const row of assignees) {
    if (!byTask.has(row.task_id)) byTask.set(row.task_id, [])
    byTask.get(row.task_id).push(row.member_id)
  }

  const checklist = db.prepare('SELECT * FROM checklist_items ORDER BY position ASC, id ASC').all()
  const checklistByTask = new Map()
  for (const item of checklist) {
    if (!checklistByTask.has(item.task_id)) checklistByTask.set(item.task_id, [])
    checklistByTask.get(item.task_id).push(plain(item))
  }

  const options = db.prepare('SELECT * FROM task_options ORDER BY id ASC').all().map(plain)
  const votes = db.prepare('SELECT * FROM task_option_votes ORDER BY created_at ASC').all().map(plain)
  const votesByOption = new Map()
  for (const v of votes) {
    if (!votesByOption.has(v.option_id)) votesByOption.set(v.option_id, [])
    votesByOption.get(v.option_id).push(v.member_id)
  }

  const optionsByTask = new Map()
  for (const opt of options) {
    const voterIds = votesByOption.get(opt.id) || []
    const withVotes = {
      ...opt,
      votes: voterIds,
      vote_count: voterIds.length,
    }
    if (!optionsByTask.has(opt.task_id)) optionsByTask.set(opt.task_id, [])
    optionsByTask.get(opt.task_id).push(withVotes)
  }

  return tasks.map((task) => {
    const items = checklistByTask.get(task.id) || []
    return {
      ...task,
      assignees: byTask.get(task.id) || [],
      checklist: items,
      checklist_total: items.length,
      checklist_done: items.filter((i) => i.done).length,
      options: optionsByTask.get(task.id) || [],
    }
  })
}

// Las fotos de constancias no viajan en cada refresco (pesan ~100 KB c/u):
// se piden aparte con /api/budget/:id/receipt. `full` las incluye (respaldo).
export function listBudget({ full = false } = {}) {
  return db
    .prepare(
      `SELECT b.id, b.kind, b.concept, b.amount, b.status, b.owner_id, b.due_date, b.note, b.category,
              b.validated_by, b.validated_at, b.created_at,
              ${full ? 'b.receipt_url,' : ''}
              CASE WHEN b.receipt_url <> '' THEN 1 ELSE 0 END AS has_receipt,
              m.name AS owner_name, v.name AS validated_by_name
       FROM budget_items b
       LEFT JOIN members m ON m.id = b.owner_id
       LEFT JOIN members v ON v.id = b.validated_by
       ORDER BY b.kind DESC, COALESCE(b.due_date, '9999-12-31') ASC, b.id ASC`,
    )
    .all()
    .map(plain)
}

export function getBootstrap() {
  return {
    settings: getSettings(),
    members: listMembers(),
    tasks: listTasks(),
    agreements: listAgreements(),
    budget: listBudget(),
    log: listLog(25),
    serverTime: nowIso(),
  }
}
