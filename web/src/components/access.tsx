import { useEffect, useState, type FormEvent } from 'react'
import { platform } from '../api'
import { useStore } from '../store'
import { formatLongDate } from '../lib/format'
import type { EventSummary } from '../types'
import { Brand } from './brand'
import { Avatar, Button, Icon } from './ui'

/** Pide el código del evento la primera vez que una cuenta entra. */
export function JoinScreen({ slug }: { slug: string }) {
  const { refresh } = useStore()
  const [event, setEvent] = useState<EventSummary | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    platform.publicEvent(slug).then(setEvent).catch(() => setEvent(null))
  }, [slug])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      await platform.join(slug, code)
      await refresh()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo comprobar el código')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="splash">
      <Brand />
      <form className="gate" onSubmit={(e) => void submit(e)}>
        <p className="gate-kicker">Te invitaron a</p>
        <h1 className="splash-title">{event?.name || 'un evento'}</h1>
        {event?.date ? <p className="muted small">{formatLongDate(event.date)}{event.time ? ` · ${event.time}` : ''}</p> : null}
        <label className="field">
          <span className="field-label">Código del evento</span>
          <input
            className="input gate-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Pídeselo a quien organiza"
            autoComplete="off"
            autoCapitalize="none"
            autoFocus
            aria-invalid={message ? true : undefined}
            aria-describedby={message ? 'join-error' : undefined}
          />
        </label>
        {message ? (
          <p className="gate-error" id="join-error" role="alert">
            {message}
          </p>
        ) : null}
        <button className="btn btn-primary btn-md" type="submit" disabled={busy || !code.trim()}>
          {busy ? 'Comprobando…' : 'Entrar al evento'}
        </button>
        <a className="link-btn gate-back" href="/">
          Ver mis eventos
        </a>
      </form>
    </div>
  )
}

/** Primera vez en el evento: la cuenta elige cuál imán es o crea el suyo. */
export function ClaimScreen() {
  const { data, claim } = useStore()
  const [busy, setBusy] = useState<number | 'new' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  if (!data?.me) return null
  const claimed = new Set(data.me.claimed)
  const free = data.members.filter((member) => !claimed.has(member.id))
  const user = data.me.user

  const pick = async (memberId: number | null) => {
    setBusy(memberId ?? 'new')
    setMessage(await claim(memberId))
    setBusy(null)
  }

  return (
    <div className="splash">
      <Brand subtitle={data.settings.event_name} />
      <div className="gate claim">
        <h1 className="splash-title">¿Quién eres en el equipo?</h1>
        <p className="muted small">
          Elige tu nombre para que tus cambios queden firmados. Solo se hace una vez{user.name ? `, ${user.name.split(' ')[0]}` : ''}.
        </p>
        {free.length > 0 ? (
          <ul className="claim-list">
            {free.map((member) => (
              <li key={member.id}>
                <button type="button" disabled={busy !== null} onClick={() => void pick(member.id)}>
                  <Avatar member={member} size="sm" />
                  <span>{member.name}</span>
                  {busy === member.id ? <span className="spinner spinner-sm" /> : <Icon name="arrowRight" size={16} />}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <Button variant={free.length ? 'outline' : 'primary'} icon="plus" disabled={busy !== null} onClick={() => void pick(null)}>
          {busy === 'new' ? 'Creando…' : `No estoy en la lista: soy ${user.name || 'nuevo'}`}
        </Button>
        {message ? (
          <p className="gate-error" role="alert">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function NoEventScreen() {
  return (
    <div className="splash">
      <Brand />
      <div className="gate">
        <h1 className="splash-title">Ese evento no existe</h1>
        <p className="muted small">Revisa el enlace que te pasaron o entra a tus eventos.</p>
        <a className="btn btn-primary btn-md" href="/">
          Ver mis eventos
        </a>
      </div>
    </div>
  )
}
