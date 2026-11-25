import { nowIso } from './db.js'
import { membership, pdb } from './platform.js'

/*
 * Fotos por ordenar: la persona toma la foto de una boleta o un pago con la cámara y la deja
 * aquí; después decide si va a sus finanzas, a un evento o a los dos. La foto se queda en la
 * bandeja hasta que la persona la quita, y recuerda a dónde ya la llevó.
 *
 * La foto no se lee al guardarla: se lee en el destino (Mis finanzas o el evento), donde la
 * persona revisa los datos antes de guardar.
 */

pdb.exec(`
  CREATE TABLE IF NOT EXISTS inbox_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mime TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    finanzas_at TEXT NOT NULL DEFAULT '',
    event_slug TEXT NOT NULL DEFAULT '',
    event_at TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS inbox_photos_user ON inbox_photos (user_id, id);
`)

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=]+)$/i
const MAX_PHOTO_CHARS = 4_000_000 // ~3 MB: el navegador ya la envía comprimida
const MAX_PHOTOS = 60 // por persona, para que la bandeja no crezca sin fin

const publicRow = (row) => ({
  id: row.id,
  created_at: row.created_at,
  finanzas_at: row.finanzas_at,
  event_slug: row.event_slug,
  event_at: row.event_at,
})

export function mountFotos(app, { requireUser }) {
  app.get('/api/fotos', requireUser, (req, res) => {
    const rows = pdb
      .prepare('SELECT id, created_at, finanzas_at, event_slug, event_at FROM inbox_photos WHERE user_id = ? ORDER BY id DESC')
      .all(req.user.id)
    res.setHeader('Cache-Control', 'no-store')
    res.json({ photos: rows.map(publicRow), max: MAX_PHOTOS })
  })

  app.post('/api/fotos', requireUser, (req, res) => {
    const file = typeof req.body?.file === 'string' ? req.body.file.trim() : ''
    const match = DATA_URL.exec(file)
    if (!match || file.length > MAX_PHOTO_CHARS) return res.status(400).json({ error: 'La foto no tiene un formato válido o pesa demasiado' })
    const count = pdb.prepare('SELECT COUNT(*) AS n FROM inbox_photos WHERE user_id = ?').get(req.user.id).n
    if (count >= MAX_PHOTOS) return res.status(400).json({ error: `Tienes ${MAX_PHOTOS} fotos por ordenar. Ordena o quita algunas antes de tomar más.` })
    const id = Number(
      pdb.prepare('INSERT INTO inbox_photos (user_id, mime, data, created_at) VALUES (?, ?, ?, ?)').run(req.user.id, match[1].toLowerCase(), file, nowIso()).lastInsertRowid,
    )
    res.status(201).json({ photo: publicRow(pdb.prepare('SELECT * FROM inbox_photos WHERE id = ?').get(id)) })
  })

  // La imagen, solo para su dueño (la pide una etiqueta <img>, con la cookie de sesión).
  app.get('/api/fotos/:id/imagen', requireUser, (req, res) => {
    const row = pdb.prepare('SELECT mime, data FROM inbox_photos WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id)
    if (!row) return res.status(404).end()
    res.setHeader('Cache-Control', 'private, max-age=86400')
    res.type(row.mime).send(Buffer.from(row.data.slice(row.data.indexOf(',') + 1), 'base64'))
  })

  // Anota a dónde se llevó la foto: { finanzas: true } o { event: slug } (un evento de la persona).
  app.patch('/api/fotos/:id', requireUser, (req, res) => {
    const id = Number(req.params.id)
    const row = pdb.prepare('SELECT id FROM inbox_photos WHERE id = ? AND user_id = ?').get(id, req.user.id)
    if (!row) return res.status(404).json({ error: 'Esa foto ya no está' })
    if (req.body?.finanzas === true) pdb.prepare('UPDATE inbox_photos SET finanzas_at = ? WHERE id = ?').run(nowIso(), id)
    if (typeof req.body?.event === 'string' && req.body.event) {
      if (!membership(req.body.event, req.user.id)) return res.status(403).json({ error: 'No perteneces a ese evento' })
      pdb.prepare('UPDATE inbox_photos SET event_slug = ?, event_at = ? WHERE id = ?').run(req.body.event, nowIso(), id)
    }
    res.json({ photo: publicRow(pdb.prepare('SELECT * FROM inbox_photos WHERE id = ?').get(id)) })
  })

  app.delete('/api/fotos/:id', requireUser, (req, res) => {
    pdb.prepare('DELETE FROM inbox_photos WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id)
    res.json({ ok: true })
  })
}
