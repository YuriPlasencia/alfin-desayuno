import { useEffect, useRef, useState, type FormEvent } from 'react'
import { platform } from '../api'
import { Brand } from '../components/brand'
import { Avatar, Button, Field, Icon, Input, Modal } from '../components/ui'
import { daysUntil, formatLongDate } from '../lib/format'
import type { EventSummary, User } from '../types'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

const params = new URLSearchParams(window.location.search)
/** Adónde volver después de entrar (p. ej. el enlace de invitación a un evento). */
const NEXT = (() => {
  const next = params.get('next') || ''
  return /^\/e\/[a-z0-9-]+/.test(next) ? next : ''
})()

function goTo(path: string) {
  window.location.href = path
}

/** Botón oficial de Google (Google Identity Services). */
function GoogleButton({ clientId, onCredential }: { clientId: string; onCredential: (credential: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const render = () => {
      if (!window.google || !box.current) return
      window.google.accounts.id.initialize({ client_id: clientId, callback: (response) => onCredential(response.credential) })
      window.google.accounts.id.renderButton(box.current, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        locale: 'es',
        width: 300,
      })
    }
    if (window.google) return render()
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = render
    script.onerror = () => setFailed(true)
    document.head.appendChild(script)
  }, [clientId, onCredential])

  return failed ? <p className="gate-error">No se pudo cargar el ingreso con Google. Revisa tu conexión.</p> : <div ref={box} className="google-btn" />
}

function Login({ onLogged }: { onLogged: (user: User) => void }) {
  const [config, setConfig] = useState<{ googleClientId: string; nameLogin: boolean } | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    platform.config().then(setConfig).catch(() => setMessage('No hay conexión con el servidor'))
  }, [])

  const finish = async (action: () => Promise<{ user: User }>) => {
    setBusy(true)
    setMessage(null)
    try {
      const { user } = await action()
      onLogged(user)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo iniciar sesión')
    } finally {
      setBusy(false)
    }
  }

  const byName = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) void finish(() => platform.loginName(name.trim()))
  }

  return (
    <div className="portal-login">
      <section className="board portal-hero">
        <h1 className="board-title">Arma tu evento en equipo</h1>
        <p className="board-sub">
          Actividades con responsables, acuerdos, cuotas con su constancia y gastos con boleta. Todo en una pizarra que el equipo ve en vivo.
        </p>
        <ul className="portal-points">
          <li>
            <Icon name="tasks" size={18} /> Cada quien ve qué le toca y lo marca desde el celular
          </li>
          <li>
            <Icon name="wallet" size={18} /> Cuotas por Yape o Plin con foto, validadas por el equipo
          </li>
          <li>
            <Icon name="users" size={18} /> Un evento por equipo, cada uno con su código
          </li>
        </ul>
      </section>

      <section className="gate portal-access">
        <h2 className="splash-title">{NEXT ? 'Entra para unirte al evento' : 'Entra a Juntada'}</h2>
        {config?.googleClientId ? (
          <GoogleButton clientId={config.googleClientId} onCredential={(credential) => void finish(() => platform.loginGoogle(credential))} />
        ) : null}
        {config?.nameLogin ? (
          <form className="portal-name" onSubmit={byName}>
            {config.googleClientId ? <p className="portal-or">o con tu nombre</p> : null}
            <Field label="Tu nombre y apellido">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ana Torres" autoComplete="name" />
            </Field>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        ) : null}
        {!config && !message ? <span className="spinner" /> : null}
        {message ? (
          <p className="gate-error" role="alert">
            {message}
          </p>
        ) : null}
      </section>
    </div>
  )
}

function EventCard({ event }: { event: EventSummary }) {
  const days = daysUntil(event.date)
  return (
    <a className="event-card" href={`/e/${event.slug}`}>
      <span className="event-card-top">
        {event.role === 'admin' ? <span className="badge tone-info">Organizas</span> : <span className="badge tone-neutral">Participas</span>}
        {days !== null ? (
          <span className={`event-days ${days < 0 ? 'is-past' : ''}`}>
            {days < 0 ? 'Ya pasó' : days === 0 ? '¡Es hoy!' : days === 1 ? 'Mañana' : `En ${days} días`}
          </span>
        ) : null}
      </span>
      <strong className="event-card-name">{event.name}</strong>
      <span className="muted small">
        {event.date ? formatLongDate(event.date) : 'Fecha por definir'}
        {event.time ? ` · ${event.time}` : ''}
      </span>
      {event.location ? <span className="muted small">{event.location}</span> : null}
      <span className="event-card-go">
        Entrar <Icon name="arrowRight" size={15} />
      </span>
    </a>
  )
}

function CreateEvent({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [location, setLocation] = useState('')
  const [guests, setGuests] = useState('20')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const { slug } = await platform.createEvent({ name: name.trim(), date, time, location, guests: Number(guests) || 20, code })
      goTo(`/e/${slug}`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo crear el evento')
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nuevo evento"
      description="Tendrá su propia pizarra: actividades, acuerdos, equipo y presupuesto."
      footer={
        <>
          <span className="spacer" />
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={busy || !name.trim() || code.trim().length < 4}>
            {busy ? 'Creando…' : 'Crear evento'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Nombre del evento">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Al Fin Desayuno" autoFocus />
        </Field>
        <div className="form-row">
          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Hora">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="Invitados">
            <Input type="number" min="1" value={guests} onChange={(e) => setGuests(e.target.value)} />
          </Field>
        </div>
        <Field label="Lugar">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Salón, dirección o referencia" />
        </Field>
        <Field label="Código del evento" hint="Quien quiera entrar lo necesita. Mínimo 4 caracteres; podrás cambiarlo en Ajustes.">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ej. desayuno-nov" autoComplete="off" />
        </Field>
        {message ? (
          <p className="gate-error" role="alert">
            {message}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

/** Unirse con el enlace que pasó el equipo (o el nombre corto del evento). */
function JoinEvent({ onClose }: { onClose: () => void }) {
  const [link, setLink] = useState('')
  const slug = (link.trim().match(/\/e\/([a-z0-9-]+)/)?.[1] || link.trim().toLowerCase()).replace(/[^a-z0-9-]/g, '')
  return (
    <Modal
      open
      onClose={onClose}
      title="Unirme a un evento"
      description="Pega el enlace que te compartieron. Luego te pedirá el código del evento."
      footer={
        <>
          <span className="spacer" />
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => goTo(`/e/${slug}`)} disabled={!slug}>
            Continuar
          </Button>
        </>
      }
    >
      <Field label="Enlace del evento">
        <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…/e/al-fin-desayuno-noviembre-2026" autoFocus />
      </Field>
    </Modal>
  )
}

export function Portal() {
  const [state, setState] = useState<{ user: User | null; events: EventSummary[] } | null>(null)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)

  const load = () =>
    platform
      .me()
      .then((me) => {
        // Llegó desde el menú Compartir del celular: va al último evento abierto.
        if (params.has('compartido') && me.user) {
          let last = ''
          try {
            last = localStorage.getItem('juntada.lastEvent') || ''
          } catch {
            /* sin almacenamiento */
          }
          const target = last || me.events[0]?.slug
          if (target) return goTo(`/e/${target}/?compartido=1#/presupuesto`)
        }
        if (me.user && NEXT) return goTo(NEXT)
        setState(me)
      })
      .catch(() => setState({ user: null, events: [] }))

  useEffect(() => {
    void load()
  }, [])

  const logout = async () => {
    await platform.logout().catch(() => {})
    setState({ user: null, events: [] })
  }

  return (
    <div className="portal">
      <header className="portal-top">
        <Brand subtitle="Eventos en equipo" />
        {state?.user ? (
          <div className="portal-user">
            <Avatar member={{ name: state.user.name, color: '#1D3FBF', photo_url: state.user.picture }} size="sm" />
            <span className="portal-user-name">{state.user.name.split(' ')[0]}</span>
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              Salir
            </Button>
          </div>
        ) : null}
      </header>

      <main className="portal-main">
        {!state ? (
          <div className="splash-inline">
            <span className="spinner" />
          </div>
        ) : !state.user ? (
          <Login onLogged={() => void load()} />
        ) : (
          <div className="stack">
            <div className="page-head">
              <div>
                <h1>Tus eventos</h1>
                <p className="muted">
                  {state.events.length === 0 ? 'Crea uno o únete con el enlace que te pasó tu equipo.' : 'Entra a la pizarra de cada uno.'}
                </p>
              </div>
              <div className="btn-group">
                <Button variant="outline" icon="users" onClick={() => setJoining(true)}>
                  Unirme a un evento
                </Button>
                <Button icon="plus" onClick={() => setCreating(true)}>
                  Crear evento
                </Button>
              </div>
            </div>
            {state.events.length === 0 ? (
              <div className="empty">
                <span className="empty-icon">
                  <Icon name="sparkles" size={22} />
                </span>
                <p className="empty-title">Todavía no tienes eventos</p>
                <p className="muted small">Un desayuno, un aniversario, un paseo: cada evento tiene su propia pizarra y su código.</p>
              </div>
            ) : (
              <div className="event-grid">
                {state.events.map((event) => (
                  <EventCard key={event.slug} event={event} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>
      {creating ? <CreateEvent onClose={() => setCreating(false)} /> : null}
      {joining ? <JoinEvent onClose={() => setJoining(false)} /> : null}
    </div>
  )
}
