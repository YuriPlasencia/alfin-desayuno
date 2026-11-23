import crypto from 'node:crypto'
import { db, nowIso, plain } from './db.js'

/*
 * Amigo secreto. Regla de oro: a quién le regala cada uno solo lo sabe esa persona.
 * Las parejas viven en esta base y nunca viajan en /bootstrap, en el respaldo ni en el
 * registro de actividad; ni quien organiza las ve hasta la revelación. Cada papelito
 * queda atado a la cuenta que se apuntó (user_id), no solo al imán: así nadie lo lee
 * tomando el imán de otra persona.
 */

export function initSecretSchema(conn) {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS secret_game (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL DEFAULT 'armando',
      title TEXT NOT NULL DEFAULT '',
      budget_min REAL NOT NULL DEFAULT 0,
      budget_max REAL NOT NULL DEFAULT 0,
      deliver_date TEXT NOT NULL DEFAULT '',
      deliver_time TEXT NOT NULL DEFAULT '',
      place TEXT NOT NULL DEFAULT '',
      rules TEXT NOT NULL DEFAULT '',
      sweets INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at TEXT NOT NULL,
      drawn_at TEXT,
      revealed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS secret_participants (
      member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL,
      receiver_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      seen_at TEXT,
      gift_ready INTEGER NOT NULL DEFAULT 0,
      guess_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      joined_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS secret_wishes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      link TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS secret_exclusions (
      a_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      b_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      PRIMARY KEY (a_id, b_id)
    );

    CREATE TABLE IF NOT EXISTS secret_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      giver_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      from_giver INTEGER NOT NULL DEFAULT 1,
      kind TEXT NOT NULL DEFAULT 'mensaje',
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at TEXT
    );
  `)
}

// ---------- sorteo ----------

function shuffled(list) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Reparte los papelitos: nadie se saca a sí mismo ni a alguien de sus exclusiones.
 * Primero busca una sola ronda (A→B→C→…→A): así en la entrega cada quien pasa la posta
 * al siguiente y nunca hay dos personas que se regalan entre sí. Si las exclusiones no
 * lo permiten, acepta varias rondas; como último recurso, parejas cruzadas.
 * `blocked` es un Set de "dador>receptor". Devuelve Map(dador → receptor) o null.
 */
export function drawPairs(ids, blocked = new Set()) {
  const n = ids.length
  if (n < 3) return null
  const ok = (a, b) => a !== b && !blocked.has(`${a}>${b}`)

  // 1) Una sola ronda, con retroceso y un tope de pasos.
  let steps = 0
  const order = shuffled(ids)
  const used = new Set([order[0]])
  const path = [order[0]]
  const walk = () => {
    if (path.length === n) return ok(path[n - 1], path[0])
    if (++steps > 200_000) return false
    const last = path[path.length - 1]
    for (const next of shuffled(order)) {
      if (used.has(next) || !ok(last, next)) continue
      used.add(next)
      path.push(next)
      if (walk()) return true
      path.pop()
      used.delete(next)
    }
    return false
  }
  if (walk()) {
    const pairs = new Map()
    path.forEach((giver, i) => pairs.set(giver, path[(i + 1) % n]))
    return pairs
  }

  // 2) Cualquier reparto válido; primero sin parejas que se regalen entre sí.
  for (const allowMutual of [false, true]) {
    const options = new Map(ids.map((id) => [id, shuffled(ids.filter((other) => ok(id, other)))]))
    const givers = [...ids].sort((a, b) => options.get(a).length - options.get(b).length)
    const pairs = new Map()
    const taken = new Set()
    let tries = 0
    const assign = (index) => {
      if (index === n) return true
      if (++tries > 200_000) return false
      const giver = givers[index]
      for (const receiver of options.get(giver)) {
        if (taken.has(receiver)) continue
        if (!allowMutual && pairs.get(receiver) === giver) continue
        pairs.set(giver, receiver)
        taken.add(receiver)
        if (assign(index + 1)) return true
        pairs.delete(giver)
        taken.delete(receiver)
      }
      return false
    }
    if (assign(0)) return pairs
  }
  return null
}

// ---------- lecturas ----------

const getGame = () => plain(db.prepare('SELECT * FROM secret_game WHERE id = 1').get())
const listParticipants = () =>
  db.prepare('SELECT * FROM secret_participants ORDER BY joined_at ASC, member_id ASC').all().map(plain)
const wishesOf = (memberId) =>
  db.prepare('SELECT id, title, link, price FROM secret_wishes WHERE member_id = ? ORDER BY id ASC').all(memberId).map(plain)

function blockedSet() {
  const set = new Set()
  for (const row of db.prepare('SELECT a_id, b_id FROM secret_exclusions').all()) {
    set.add(`${row.a_id}>${row.b_id}`)
    set.add(`${row.b_id}>${row.a_id}`)
  }
  return set
}

/** El papelito de quien pregunta: mismo imán y misma cuenta que se apuntó. */
function mine(req) {
  const memberId = Number(req.membership?.member_id) || 0
  if (!memberId) return { row: null, locked: false }
  const row = plain(db.prepare('SELECT * FROM secret_participants WHERE member_id = ?').get(memberId))
  if (!row) return { row: null, locked: false }
  if (row.user_id !== req.user.id) return { row: null, locked: true }
  return { row, locked: false }
}

/** ¿Hay un amigo secreto creado en el evento en curso? (importar una copia lo borraría). */
export const secretGameExists = () => Boolean(getGame())

/**
 * Organiza quien administra el evento o quien creó el juego. «Coordina al equipo» (is_lead) no cuenta:
 * cualquier miembro puede marcarlo en su propia ficha y con eso revelaría las parejas.
 */
function canManage(req, game) {
  if (req.membership?.role === 'admin') return true
  const memberId = Number(req.membership?.member_id) || 0
  if (!memberId) return false
  return Boolean(game && game.created_by === memberId)
}

const thread = (rows, iAmGiver) =>
  rows.map((m) => ({
    id: m.id,
    mine: Boolean(m.from_giver) === iAmGiver,
    kind: m.kind,
    body: m.body,
    created_at: m.created_at,
  }))

function stateFor(req) {
  const game = getGame()
  if (!game) return { game: null, can_manage: true, participants: [], exclusions: [], me: null, locked: false, reveal: null }
  const manage = canManage(req, game)
  const drawn = game.status !== 'armando'
  const rows = listParticipants()
  const wishCounts = new Map(
    db.prepare('SELECT member_id, COUNT(*) AS n FROM secret_wishes GROUP BY member_id').all().map((r) => [r.member_id, r.n]),
  )
  const participants = rows.map((p) => ({
    member_id: p.member_id,
    wishes: wishCounts.get(p.member_id) || 0,
    seen: drawn ? Boolean(p.seen_at) : false,
    gift_ready: drawn ? Boolean(p.gift_ready) : false,
    guessed: drawn ? Boolean(p.guess_id) : false,
  }))

  const { row, locked } = mine(req)
  let me = null
  if (row) {
    me = {
      member_id: row.member_id,
      wishes: wishesOf(row.member_id),
      receiver: null,
      seen: Boolean(row.seen_at),
      gift_ready: Boolean(row.gift_ready),
      guess_id: row.guess_id,
      to_receiver: [],
      from_giver: [],
      unread_to_receiver: 0,
      unread_from_giver: 0,
    }
    if (drawn && row.receiver_id) {
      me.receiver = { member_id: row.receiver_id, wishes: wishesOf(row.receiver_id) }
      const asGiver = db.prepare('SELECT * FROM secret_messages WHERE giver_id = ? ORDER BY id ASC').all(row.member_id)
      const asReceiver = db.prepare('SELECT * FROM secret_messages WHERE receiver_id = ? ORDER BY id ASC').all(row.member_id)
      me.to_receiver = thread(asGiver, true)
      me.from_giver = thread(asReceiver, false)
      me.unread_to_receiver = asGiver.filter((m) => !m.from_giver && !m.read_at).length
      me.unread_from_giver = asReceiver.filter((m) => m.from_giver && !m.read_at).length
    }
  }

  return {
    game,
    can_manage: manage,
    participants,
    exclusions: manage ? db.prepare('SELECT a_id, b_id FROM secret_exclusions').all().map((r) => [r.a_id, r.b_id]) : [],
    me,
    locked,
    reveal:
      game.status === 'revelado'
        ? rows.filter((p) => p.receiver_id).map((p) => ({ giver_id: p.member_id, receiver_id: p.receiver_id }))
        : null,
    // Quién creía cada uno que le regalaba (solo tras la revelación).
    guesses: game.status === 'revelado' ? rows.map((p) => ({ member_id: p.member_id, guess_id: p.guess_id })) : null,
  }
}

/** Resumen para /bootstrap: nada que delate una pareja. */
export function secretSummary(req) {
  const game = getGame()
  if (!game) return null
  const count = db.prepare('SELECT COUNT(*) AS n FROM secret_participants').get().n
  const { row } = mine(req)
  let unread = 0
  let pending = false
  if (row && game.status !== 'armando') {
    unread =
      db.prepare('SELECT COUNT(*) AS n FROM secret_messages WHERE giver_id = ? AND from_giver = 0 AND read_at IS NULL').get(row.member_id).n +
      db.prepare('SELECT COUNT(*) AS n FROM secret_messages WHERE receiver_id = ? AND from_giver = 1 AND read_at IS NULL').get(row.member_id).n
    pending = game.status === 'sorteado' && !row.seen_at
  }
  return {
    status: game.status,
    title: game.title,
    deliver_date: game.deliver_date,
    count,
    joined: Boolean(row),
    unread,
    pending,
  }
}

/**
 * Antes de retirar a un integrante: si ya hubo sorteo, quien le regalaba hereda a su
 * amigo secreto, para que nadie se quede sin regalo ni haya que sortear de nuevo.
 */
export function secretBeforeMemberDelete(memberId) {
  const game = getGame()
  if (!game || game.status !== 'sorteado') return
  const leaving = db.prepare('SELECT * FROM secret_participants WHERE member_id = ?').get(memberId)
  if (!leaving) return
  const giver = db.prepare('SELECT * FROM secret_participants WHERE receiver_id = ?').get(memberId)
  if (!giver) return
  const fresh = (id, receiverId) =>
    db.prepare('UPDATE secret_participants SET receiver_id = ?, seen_at = NULL, gift_ready = 0 WHERE member_id = ?').run(receiverId, id)
  if (leaving.receiver_id && leaving.receiver_id !== giver.member_id) {
    fresh(giver.member_id, leaving.receiver_id)
    return
  }
  // Se regalaban entre sí: quien queda entra en otra pareja (A→B pasa a A→queda→B).
  const others = db
    .prepare('SELECT * FROM secret_participants WHERE member_id NOT IN (?, ?) AND receiver_id IS NOT NULL')
    .all(memberId, giver.member_id)
  if (others.length < 2) {
    // Quedan menos de tres: se vuelve a armar el juego.
    db.exec("DELETE FROM secret_messages; UPDATE secret_participants SET receiver_id = NULL, seen_at = NULL, gift_ready = 0, guess_id = NULL; UPDATE secret_game SET status = 'armando', drawn_at = NULL WHERE id = 1")
    return
  }
  const host = others[crypto.randomInt(others.length)]
  db.prepare('DELETE FROM secret_messages WHERE giver_id = ?').run(host.member_id)
  fresh(giver.member_id, host.receiver_id)
  fresh(host.member_id, giver.member_id)
}

// ---------- rutas ----------

export function mountSecreto(ev, { note, broadcast, text, num, dateOrNull }) {
  const send = (req, res, status = 200) => res.status(status).json(stateFor(req))
  const fail = (res, status, error) => res.status(status).json({ error })

  ev.get('/secreto', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    send(req, res)
  })

  // Crear o ajustar las reglas del juego.
  ev.put('/secreto', (req, res) => {
    const game = getGame()
    if (game && !canManage(req, game)) return fail(res, 403, 'Solo quien organiza puede cambiar las reglas')
    if (game?.status === 'revelado') return fail(res, 409, 'El juego ya terminó')
    const memberId = Number(req.membership?.member_id) || null
    const body = req.body || {}
    const min = Math.max(0, num(body.budget_min, 0))
    const max = Math.max(0, num(body.budget_max, 0))
    const values = [
      text(body.title).slice(0, 80),
      min,
      max && max < min ? min : max,
      dateOrNull(body.deliver_date) ?? '',
      text(body.deliver_time).slice(0, 10),
      text(body.place).slice(0, 120),
      text(body.rules).slice(0, 600),
      body.sweets === false || body.sweets === 0 ? 0 : 1,
    ]
    if (game) {
      db.prepare(
        'UPDATE secret_game SET title = ?, budget_min = ?, budget_max = ?, deliver_date = ?, deliver_time = ?, place = ?, rules = ?, sweets = ? WHERE id = 1',
      ).run(...values)
      note(req, 'secreto', 1, 'update', 'Ajustó las reglas del amigo secreto')
    } else {
      db.prepare(
        `INSERT INTO secret_game (id, status, title, budget_min, budget_max, deliver_date, deliver_time, place, rules, sweets, created_by, created_at)
         VALUES (1, 'armando', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(...values, memberId, nowIso())
      if (memberId) {
        db.prepare('INSERT OR IGNORE INTO secret_participants (member_id, user_id, joined_at) VALUES (?, ?, ?)').run(memberId, req.user.id, nowIso())
      }
      note(req, 'secreto', 1, 'create', 'Abrió un amigo secreto')
    }
    broadcast()
    send(req, res)
  })

  ev.delete('/secreto', (req, res) => {
    const game = getGame()
    if (!game) return send(req, res)
    if (!canManage(req, game)) return fail(res, 403, 'Solo quien organiza puede cancelar el juego')
    db.exec('DELETE FROM secret_messages; DELETE FROM secret_exclusions; DELETE FROM secret_wishes; DELETE FROM secret_participants; DELETE FROM secret_game;')
    note(req, 'secreto', 1, 'delete', 'Canceló el amigo secreto')
    broadcast()
    send(req, res)
  })

  ev.post('/secreto/join', (req, res) => {
    const game = getGame()
    if (!game) return fail(res, 404, 'Todavía no hay un amigo secreto')
    if (game.status !== 'armando') return fail(res, 409, 'El sorteo ya se hizo. Pide a quien organiza que sortee de nuevo para entrar.')
    const memberId = Number(req.membership?.member_id) || 0
    if (!memberId) return fail(res, 400, 'Primero elige quién eres en el evento')
    const existing = db.prepare('SELECT user_id FROM secret_participants WHERE member_id = ?').get(memberId)
    if (existing && existing.user_id !== req.user.id) return fail(res, 409, 'Ese nombre ya se apuntó desde otra cuenta')
    if (!existing) {
      db.prepare('INSERT INTO secret_participants (member_id, user_id, joined_at) VALUES (?, ?, ?)').run(memberId, req.user.id, nowIso())
      note(req, 'secreto', 1, 'join', 'Se apuntó al amigo secreto')
      broadcast()
    }
    send(req, res)
  })

  // Salirse (o, quien organiza, retirar a alguien) antes del sorteo.
  ev.post('/secreto/leave', (req, res) => {
    const game = getGame()
    if (!game) return fail(res, 404, 'Todavía no hay un amigo secreto')
    if (game.status !== 'armando') return fail(res, 409, 'Ya se sorteó: nadie puede salirse sin romper la ronda')
    const own = Number(req.membership?.member_id) || 0
    const target = Number(req.body?.member_id) || own
    if (target !== own && !canManage(req, game)) return fail(res, 403, 'Solo quien organiza puede retirar a alguien')
    if (target === own && mine(req).locked) return fail(res, 403, 'Esta cuenta no es la que se apuntó')
    db.prepare('DELETE FROM secret_participants WHERE member_id = ?').run(target)
    db.prepare('DELETE FROM secret_exclusions WHERE a_id = ? OR b_id = ?').run(target, target)
    note(req, 'secreto', 1, 'leave', target === own ? 'Salió del amigo secreto' : 'Retiró a alguien del amigo secreto')
    broadcast()
    send(req, res)
  })

  ev.post('/secreto/wishes', (req, res) => {
    const { row } = mine(req)
    if (!row) return fail(res, 403, 'Apúntate al amigo secreto para armar tu lista')
    const title = text(req.body?.title).slice(0, 120)
    if (!title) return fail(res, 400, 'Escribe qué te gustaría recibir')
    if (db.prepare('SELECT COUNT(*) AS n FROM secret_wishes WHERE member_id = ?').get(row.member_id).n >= 12) {
      return fail(res, 400, 'Tu lista ya tiene 12 deseos')
    }
    const link = text(req.body?.link).slice(0, 500)
    db.prepare('INSERT INTO secret_wishes (member_id, title, link, price, created_at) VALUES (?, ?, ?, ?, ?)').run(
      row.member_id,
      title,
      /^https?:\/\/\S+$/i.test(link) ? link : '',
      Math.max(0, num(req.body?.price, 0)),
      nowIso(),
    )
    broadcast()
    send(req, res, 201)
  })

  ev.delete('/secreto/wishes/:id', (req, res) => {
    const { row } = mine(req)
    if (!row) return fail(res, 403, 'Esa lista no es tuya')
    db.prepare('DELETE FROM secret_wishes WHERE id = ? AND member_id = ?').run(Number(req.params.id), row.member_id)
    broadcast()
    send(req, res)
  })

  // Parejas que no deben tocarse entre sí (esposos, quien ya le regaló el año pasado…).
  ev.put('/secreto/exclusions', (req, res) => {
    const game = getGame()
    if (!game) return fail(res, 404, 'Todavía no hay un amigo secreto')
    if (!canManage(req, game)) return fail(res, 403, 'Solo quien organiza puede poner excepciones')
    if (game.status !== 'armando') return fail(res, 409, 'El sorteo ya se hizo')
    const inGame = new Set(listParticipants().map((p) => p.member_id))
    const pairs = Array.isArray(req.body?.pairs) ? req.body.pairs : []
    db.exec('DELETE FROM secret_exclusions')
    const insert = db.prepare('INSERT OR IGNORE INTO secret_exclusions (a_id, b_id) VALUES (?, ?)')
    for (const pair of pairs.slice(0, 200)) {
      const a = Number(pair?.[0])
      const b = Number(pair?.[1])
      if (a && b && a !== b && inGame.has(a) && inGame.has(b)) insert.run(Math.min(a, b), Math.max(a, b))
    }
    broadcast()
    send(req, res)
  })

  ev.post('/secreto/draw', (req, res) => {
    const game = getGame()
    if (!game) return fail(res, 404, 'Todavía no hay un amigo secreto')
    if (!canManage(req, game)) return fail(res, 403, 'Solo quien organiza puede hacer el sorteo')
    if (game.status === 'revelado') return fail(res, 409, 'El juego ya terminó')
    const ids = listParticipants().map((p) => p.member_id)
    if (ids.length < 3) return fail(res, 400, 'Se necesitan al menos 3 personas para sortear')
    const pairs = drawPairs(ids, blockedSet())
    if (!pairs) return fail(res, 409, 'Con esas excepciones no hay sorteo posible. Quita alguna y vuelve a intentar.')
    db.exec('BEGIN')
    try {
      db.exec('DELETE FROM secret_messages; UPDATE secret_participants SET seen_at = NULL, gift_ready = 0, guess_id = NULL;')
      const set = db.prepare('UPDATE secret_participants SET receiver_id = ? WHERE member_id = ?')
      for (const [giver, receiver] of pairs) set.run(receiver, giver)
      db.prepare("UPDATE secret_game SET status = 'sorteado', drawn_at = ? WHERE id = 1").run(nowIso())
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    note(req, 'secreto', 1, 'draw', game.status === 'sorteado' ? 'Volvió a sortear el amigo secreto' : `Sorteó el amigo secreto entre ${ids.length} personas`)
    broadcast()
    send(req, res)
  })

  // Deshacer el sorteo para que entre o salga gente.
  ev.post('/secreto/reopen', (req, res) => {
    const game = getGame()
    if (!game) return fail(res, 404, 'Todavía no hay un amigo secreto')
    if (!canManage(req, game)) return fail(res, 403, 'Solo quien organiza puede deshacer el sorteo')
    if (game.status !== 'sorteado') return fail(res, 409, 'No hay un sorteo que deshacer')
    db.exec("DELETE FROM secret_messages; UPDATE secret_participants SET receiver_id = NULL, seen_at = NULL, gift_ready = 0, guess_id = NULL; UPDATE secret_game SET status = 'armando', drawn_at = NULL WHERE id = 1")
    note(req, 'secreto', 1, 'reopen', 'Deshizo el sorteo del amigo secreto')
    broadcast()
    send(req, res)
  })

  const playing = (req, res) => {
    const game = getGame()
    const { row } = mine(req)
    if (!game || !row || game.status === 'armando' || !row.receiver_id) {
      fail(res, 403, 'Todavía no tienes amigo secreto')
      return null
    }
    return { game, row }
  }

  ev.post('/secreto/seen', (req, res) => {
    const ctx = playing(req, res)
    if (!ctx) return
    if (!ctx.row.seen_at) {
      db.prepare('UPDATE secret_participants SET seen_at = ? WHERE member_id = ?').run(nowIso(), ctx.row.member_id)
      broadcast()
    }
    send(req, res)
  })

  ev.post('/secreto/gift', (req, res) => {
    const ctx = playing(req, res)
    if (!ctx) return
    db.prepare('UPDATE secret_participants SET gift_ready = ? WHERE member_id = ?').run(req.body?.ready ? 1 : 0, ctx.row.member_id)
    broadcast()
    send(req, res)
  })

  // ¿Quién crees que te regala? Se puede cambiar hasta la revelación.
  ev.post('/secreto/guess', (req, res) => {
    const ctx = playing(req, res)
    if (!ctx) return
    if (ctx.game.status !== 'sorteado') return fail(res, 409, 'Ya se reveló el juego')
    const guess = Number(req.body?.member_id) || null
    if (guess && (guess === ctx.row.member_id || !db.prepare('SELECT 1 FROM secret_participants WHERE member_id = ?').get(guess))) {
      return fail(res, 400, 'Elige a alguien que esté jugando')
    }
    db.prepare('UPDATE secret_participants SET guess_id = ? WHERE member_id = ?').run(guess, ctx.row.member_id)
    broadcast()
    send(req, res)
  })

  // Mensajes anónimos: 'receiver' = le escribo a quien le regalo; 'giver' = le respondo a quien me regala.
  ev.post('/secreto/messages', (req, res) => {
    const ctx = playing(req, res)
    if (!ctx) return
    if (ctx.game.status !== 'sorteado') return fail(res, 409, 'Ya se reveló el juego: escríbanse por el chat de siempre')
    const body = text(req.body?.body).slice(0, 500)
    if (!body) return fail(res, 400, 'Escribe el mensaje')
    const toReceiver = req.body?.to !== 'giver'
    let giverId = ctx.row.member_id
    let receiverId = ctx.row.receiver_id
    if (!toReceiver) {
      const giver = db.prepare('SELECT member_id FROM secret_participants WHERE receiver_id = ?').get(ctx.row.member_id)
      if (!giver) return fail(res, 409, 'Todavía no tienes amigo secreto')
      giverId = giver.member_id
      receiverId = ctx.row.member_id
    }
    if (db.prepare('SELECT COUNT(*) AS n FROM secret_messages WHERE giver_id = ?').get(giverId).n >= 300) {
      return fail(res, 400, 'Esta conversación ya está muy larga')
    }
    const kind = toReceiver && req.body?.kind === 'endulzada' ? 'endulzada' : 'mensaje'
    db.prepare('INSERT INTO secret_messages (giver_id, receiver_id, from_giver, kind, body, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      giverId,
      receiverId,
      toReceiver ? 1 : 0,
      kind,
      body,
      nowIso(),
    )
    broadcast()
    send(req, res, 201)
  })

  ev.post('/secreto/read', (req, res) => {
    const ctx = playing(req, res)
    if (!ctx) return
    const now = nowIso()
    const changed =
      req.body?.thread === 'giver'
        ? db.prepare('UPDATE secret_messages SET read_at = ? WHERE receiver_id = ? AND from_giver = 1 AND read_at IS NULL').run(now, ctx.row.member_id)
        : db.prepare('UPDATE secret_messages SET read_at = ? WHERE giver_id = ? AND from_giver = 0 AND read_at IS NULL').run(now, ctx.row.member_id)
    if (changed.changes) broadcast()
    send(req, res)
  })

  ev.post('/secreto/reveal', (req, res) => {
    const game = getGame()
    if (!game) return fail(res, 404, 'Todavía no hay un amigo secreto')
    if (!canManage(req, game)) return fail(res, 403, 'Solo quien organiza puede revelar')
    if (game.status !== 'sorteado') return fail(res, 409, 'Primero hagan el sorteo')
    db.prepare("UPDATE secret_game SET status = 'revelado', revealed_at = ? WHERE id = 1").run(nowIso())
    note(req, 'secreto', 1, 'reveal', 'Reveló el amigo secreto')
    broadcast()
    send(req, res)
  })
}
