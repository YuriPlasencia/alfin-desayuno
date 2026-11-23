// Lista de correos de quienes entraron a Juntay, en CSV (una fila por correo).
//   npm run correos                  → todos
//   npm run correos -- --novedades   → solo quienes aceptaron recibir novedades
// En Render: pestaña Shell del servicio y el mismo comando (lee el disco /data).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const here = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || path.join(here, '..', 'data')
const onlyNews = process.argv.includes('--novedades')

const db = new DatabaseSync(path.join(dataDir, 'juntada.db'), { readOnly: true })
const columns = db.prepare('PRAGMA table_info(users)').all().map((col) => col.name)
const hasNews = columns.includes('news_opt_in')

const rows = db
  .prepare(
    `SELECT lower(email) AS email, name, ${hasNews ? 'news_opt_in' : '0'} AS news, created_at, last_login_at
     FROM users WHERE email != '' ORDER BY last_login_at ASC`,
  )
  .all()

// Varias entradas con el mismo correo: queda el nombre más reciente y el permiso si alguna vez lo dio.
const byEmail = new Map()
for (const row of rows) {
  const prev = byEmail.get(row.email)
  byEmail.set(row.email, {
    email: row.email,
    name: row.name,
    news: Boolean(row.news) || Boolean(prev?.news),
    first: prev?.first || row.created_at,
    last: row.last_login_at,
  })
}

const csv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
console.log('nombre,correo,acepta_novedades,primera_vez,ultima_vez')
let count = 0
for (const person of byEmail.values()) {
  if (onlyNews && !person.news) continue
  console.log([person.name, person.email, person.news ? 'si' : 'no', person.first, person.last].map(csv).join(','))
  count += 1
}
console.error(`${count} correo(s)${onlyNews ? ' que aceptaron novedades' : ''}`)
