import { useEffect, useRef, useState, type FormEvent } from 'react'
import { platform } from '../api'
import { Brand } from '../components/brand'
import { Avatar, Button, Field, Icon, Input, Modal } from '../components/ui'
import { daysUntil, formatLongDate } from '../lib/format'
import { CATEGORIES, CATEGORY_IDS, EVENT_KINDS, readCategory, saveCategory } from '../lib/categories'
import type { EventCategory, EventSummary, EventType, User } from '../types'

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

/** Trabajo, Familiar o Entretenimiento: botones de una sola elección. */
function CategoryPicker({ value, onChange, labelledBy }: { value: EventCategory; onChange: (next: EventCategory) => void; labelledBy?: string }) {
  return (
    <div className="chip-select category-picker" role="radiogroup" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : 'Categoría'}>
      {CATEGORY_IDS.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          className={`chip event-kind ${value === id ? 'is-selected' : ''}`}
          onClick={() => onChange(id)}
        >
          <Icon name={CATEGORIES[id].icon} size={15} />
          {CATEGORIES[id].label}
        </button>
      ))}
    </div>
  )
}

function Login({ onLogged }: { onLogged: (user: User) => void }) {
  const [category, setCategory] = useState<EventCategory>(readCategory)
  const pickCategory = (next: EventCategory) => {
    setCategory(next)
    saveCategory(next)
  }
  const [config, setConfig] = useState<{ googleClientId: string; nameLogin: boolean } | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [news, setNews] = useState(false)
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

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
  const byName = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim() && emailOk) void finish(() => platform.loginName(name.trim(), email.trim(), news))
  }

  const info = CATEGORIES[category]

  return (
    <div className="portal-login">
      {/* Primero se elige para qué es; en el celular queda encima del cuadro para entrar. */}
      <div className="portal-categories">
        <p className="portal-ask" id="portal-ask">
          ¿Para qué lo vas a usar?
        </p>
        <CategoryPicker value={category} onChange={pickCategory} labelledBy="portal-ask" />
      </div>
      <section className="board portal-hero">
        <h1 className="board-title">{info.title}</h1>
        <p className="board-sub">{info.sub}</p>
        <ul className="portal-points">
          {info.points.map((point) => (
            <li key={point.text}>
              <Icon name={point.icon} size={18} /> {point.text}
            </li>
          ))}
        </ul>
        <p className="portal-kinds muted small">
          Para {info.types.map((type) => EVENT_KINDS[type].label.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' y $1')}.
        </p>
      </section>

      <section className="gate portal-access">
        <h2 className="splash-title">{NEXT ? 'Entra para unirte al evento' : 'Entra a Juntay'}</h2>
        {config?.googleClientId ? (
          <GoogleButton clientId={config.googleClientId} onCredential={(credential) => void finish(() => platform.loginGoogle(credential))} />
        ) : null}
        {config?.nameLogin ? (
          <form className="portal-name" onSubmit={byName}>
            {config.googleClientId ? <p className="portal-or">o con tu nombre</p> : null}
            <Field label="Tu nombre y apellido">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ana Torres" autoComplete="name" />
            </Field>
            <Field label="Tu correo">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Ej. ana@correo.com"
                autoComplete="email"
                inputMode="email"
              />
            </Field>
            <label className="portal-news">
              <input type="checkbox" checked={news} onChange={(e) => setNews(e.target.checked)} />
              <span>Quiero recibir novedades de Juntay por correo</span>
            </label>
            <Button type="submit" disabled={busy || !name.trim() || !emailOk}>
              {busy ? 'Entrando…' : 'Entrar'}
            </Button>
            <p className="portal-privacy muted small">
              Usamos tu correo para identificarte en tus eventos. No lo compartimos. Las novedades llegan solo si marcas la casilla.
            </p>
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
      {eventLabel(event) ? <span className="event-card-kind">{eventLabel(event)}</span> : null}
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

/** «Familiar · Cumpleaños» para la tarjeta (vacío en eventos de antes). */
const eventLabel = (event: EventSummary) =>
  [event.category ? CATEGORIES[event.category]?.label : '', event.type ? EVENT_KINDS[event.type]?.label : ''].filter(Boolean).join(' · ')

function CreateEvent({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<EventCategory>(readCategory)
  const [type, setType] = useState<EventType>(() => CATEGORIES[readCategory()].types[0])
  const [timeTouched, setTimeTouched] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState(() => EVENT_KINDS[CATEGORIES[readCategory()].types[0]].time)
  const kind = EVENT_KINDS[type]
  const secret = type === 'secreto'
  const pickType = (next: EventType) => {
    setType(next)
    // La hora sugerida acompaña al tipo mientras nadie la haya cambiado a mano.
    if (!timeTouched) setTime(EVENT_KINDS[next].time)
  }
  const pickCategory = (next: EventCategory) => {
    setCategory(next)
    saveCategory(next)
    // Si el tipo elegido no existe en la nueva categoría, se pasa al primero de ella.
    if (!CATEGORIES[next].types.includes(type)) pickType(CATEGORIES[next].types[0])
  }
  const [location, setLocation] = useState('')
  const [guests, setGuests] = useState('20')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const { slug } = await platform.createEvent({ name: name.trim(), date, time, location, guests: Number(guests) || 20, code, type, category })
      // Un amigo secreto se abre directo en su juego.
      goTo(secret ? `/e/${slug}#/secreto` : `/e/${slug}`)
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
      description={
        secret
          ? 'Juntay abre el juego: cada quien se apunta, deja su lista de deseos y recibe su papelito secreto.'
          : 'Tendrá su propia pizarra: actividades, acuerdos, equipo y presupuesto.'
      }
      footer={
        <>
          <span className="spacer" />
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={busy || !name.trim() || code.trim().length < 6}>
            {busy ? 'Creando…' : 'Crear evento'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Categoría">
          <CategoryPicker value={category} onChange={pickCategory} />
        </Field>
        <Field label="Tipo de evento">
          <div className="chip-select" role="radiogroup" aria-label="Tipo de evento">
            {CATEGORIES[category].types.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={type === id}
                className={`chip event-kind ${type === id ? 'is-selected' : ''}`}
                onClick={() => pickType(id)}
              >
                {id === 'secreto' ? <Icon name="gift" size={15} /> : null}
                {EVENT_KINDS[id].label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Nombre del evento">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind.example} autoFocus />
        </Field>
        <div className="form-row">
          <Field label={secret ? 'Fecha de entrega' : 'Fecha'}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Hora">
            <Input
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value)
                setTimeTouched(true)
              }}
            />
          </Field>
          {secret ? null : (
            <Field label="Invitados">
              <Input type="number" min="1" value={guests} onChange={(e) => setGuests(e.target.value)} />
            </Field>
          )}
        </div>
        <Field label={secret ? 'Lugar de entrega' : 'Lugar'}>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Salón, dirección o referencia" />
        </Field>
        <Field label="Código del evento" hint="Quien quiera entrar lo necesita. Mínimo 6 caracteres; podrás cambiarlo en Ajustes.">
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
