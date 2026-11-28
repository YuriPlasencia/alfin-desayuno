import crypto from 'node:crypto'
import { nowIso } from './db.js'
import { pdb, sessionSecret } from './platform.js'

/*
 * Acceso con el correo comprobado: Juntay manda un código de 6 dígitos y un enlace.
 * Envío con Resend (RESEND_API_KEY + MAIL_FROM). En local, MAIL_DEV_LOG=1 escribe el
 * correo en la consola en vez de enviarlo. Si ninguno está configurado, la comprobación
 * queda apagada y se entra como antes (solo nombre y correo).
 */

const RESEND_API_KEY = String(process.env.RESEND_API_KEY || '').trim()
const MAIL_FROM = String(process.env.MAIL_FROM || 'Juntay <acceso@juntay.pe>').trim()
const DEV_LOG = process.env.MAIL_DEV_LOG === '1'

/** ¿Se exige comprobar el correo para entrar? */
export const EMAIL_VERIFY = Boolean(RESEND_API_KEY) || DEV_LOG

// Adónde apunta el enlace del correo: nunca se arma con la cabecera Host de la petición.
const APP_URL = String(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 8787}`).replace(/\/+$/, '')

const CODE_MINUTES = 15
const MAX_CODE_TRIES = 5

const digest = (value) => crypto.createHmac('sha256', sessionSecret()).update(value).digest('hex')
const codeHash = (email, code) => digest(`codigo:${email}:${code}`)
const tokenHash = (token) => digest(`enlace:${token}`)

function same(a, b) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

async function sendMail({ to, subject, text, html }) {
  if (!RESEND_API_KEY) {
    console.log(`[correo de prueba] Para: ${to}\nAsunto: ${subject}\n${text}\n`)
    return
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Resend respondió ${response.status}: ${detail.slice(0, 300)}`)
  }
}

/** Crea un código nuevo (anula los anteriores de ese correo) y lo envía. */
export async function sendLoginCode({ name, email, news, next }) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  const token = crypto.randomBytes(32).toString('base64url')
  const now = nowIso()
  const expires = new Date(Date.now() + CODE_MINUTES * 60_000).toISOString()
  pdb.prepare('UPDATE login_codes SET used_at = ? WHERE email = ? AND used_at IS NULL').run(now, email)
  const { lastInsertRowid } = pdb
    .prepare(
      `INSERT INTO login_codes (email, name, news, code_hash, token_hash, next, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(email, name, news ? 1 : 0, codeHash(email, code), tokenHash(token), next || '', expires, now)

  const link = `${APP_URL}/?verificar=${token}`
  const pretty = `${code.slice(0, 3)} ${code.slice(3)}`
  // Si el envío falla, queda anotado para el panel (y el código no sirve: nadie lo recibió).
  const failed = (err) => {
    pdb.prepare('UPDATE login_codes SET send_error = ?, used_at = ? WHERE id = ?').run(String(err?.message || err).slice(0, 200), nowIso(), lastInsertRowid)
    throw err
  }
  await sendMail({
    to: email,
    subject: `${pretty} es tu código para entrar a Juntay`,
    text: `Hola ${name}:\n\nTu código para entrar a Juntay es ${pretty}.\nTambién puedes entrar con este enlace: ${link}\n\nVence en ${CODE_MINUTES} minutos. Si no lo pediste, ignora este correo.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#0f172a">
<h2 style="color:#1D3FBF;margin:0 0 12px">Entra a Juntay</h2>
<p>Hola ${escapeHtml(name)}:</p>
<p>Tu código es</p>
<p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:8px 0 16px">${pretty}</p>
<p><a href="${link}" style="display:inline-block;background:#1D3FBF;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700">Entrar a Juntay</a></p>
<p style="color:#64748b;font-size:14px">Vence en ${CODE_MINUTES} minutos. Si no lo pediste, ignora este correo.</p></div>`,
  }).catch(failed)
}

/** Comprueba código o enlace. Devuelve los datos de la persona o un motivo de rechazo. */
export function checkLoginCode({ email, code, token }) {
  const now = nowIso()
  const row = token
    ? pdb.prepare('SELECT * FROM login_codes WHERE token_hash = ?').get(tokenHash(String(token)))
    : pdb.prepare('SELECT * FROM login_codes WHERE email = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1').get(email)
  if (!row || row.used_at) return { error: token ? 'Ese enlace ya se usó o no es válido. Pide un código nuevo.' : 'Pide un código nuevo.' }
  if (row.expires_at < now) return { error: 'El código venció. Pide uno nuevo.' }
  if (!token) {
    const clean = String(code || '').replace(/\D/g, '')
    if (!same(codeHash(email, clean), row.code_hash)) {
      const tries = row.attempts + 1
      pdb.prepare('UPDATE login_codes SET attempts = ?, used_at = CASE WHEN ? >= ? THEN ? ELSE used_at END WHERE id = ?').run(tries, tries, MAX_CODE_TRIES, now, row.id)
      return { error: tries >= MAX_CODE_TRIES ? 'Demasiados intentos con ese código. Pide uno nuevo.' : 'Ese código no es correcto.' }
    }
  }
  pdb.prepare('UPDATE login_codes SET used_at = ?, ok_at = ? WHERE id = ?').run(now, now, row.id)
  return { name: row.name, email: row.email, news: Boolean(row.news), next: row.next }
}
