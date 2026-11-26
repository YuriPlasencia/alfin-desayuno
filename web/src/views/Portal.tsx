import { useEffect, useRef, useState, type FormEvent } from 'react'
import { platform } from '../api'
import { Brand } from '../components/brand'
import { PhotoInbox } from '../components/PhotoInbox'
import { Avatar, Button, Field, Icon, Input, Modal } from '../components/ui'
import { daysUntil, formatLongDate } from '../lib/format'
import { CATEGORIES, CATEGORY_IDS, EVENT_KINDS, isPersonal, readCategory, saveCategory } from '../lib/categories'
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

/** Trabajo, Familiar, Entretenimiento o Finanzas personales: botones de una sola elección. */
function CategoryPicker({
  value,
  onChange,
  labelledBy,
  ids = CATEGORY_IDS,
}: {
  value: EventCategory
  onChange: (next: EventCategory) => void
  labelledBy?: string
  ids?: EventCategory[]
}) {
  return (
    <div className="chip-select category-picker" role="radiogroup" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : 'Categoría'}>
      {ids.map((id) => (
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
  const [config, setConfig] = useState<{ googleClientId: string; nameLogin: boolean; emailVerify: boolean } | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [news, setNews] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // Comprobación de correo: después de enviar, se pide el código que llegó.
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')

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
  const sendCode = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await platform.startEmail(name.trim(), email.trim(), news, NEXT)
      setSentTo(email.trim().toLowerCase())
      setCode('')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No pudimos enviar el código')
    } finally {
      setBusy(false)
    }
  }
  const byName = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !emailOk) return
    if (config?.emailVerify) void sendCode()
    else void finish(() => platform.loginName(name.trim(), email.trim(), news))
  }
  const byCode = (e: FormEvent) => {
    e.preventDefault()
    if (sentTo && code.replace(/\D/g, '').length === 6) void finish(() => platform.verifyEmail({ email: sentTo, code }))
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
        {config?.googleClientId && !config.nameLogin ? (
          <p className="portal-privacy muted small">
            Usamos tu nombre y tu correo de Google para identificarte en tus eventos. Al entrar aceptas los <a href="/terminos">términos y condiciones</a> y la <a href="/privacidad">política de privacidad</a>.
          </p>
        ) : null}
        {config?.nameLogin && sentTo ? (
          <form className="portal-name" onSubmit={byCode}>
            <p className="portal-sent">
              Te enviamos un código a <strong>{sentTo}</strong>. Escríbelo aquí o toca el enlace del correo.
            </p>
            <Field label="Código de 6 dígitos">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, '').slice(0, 7))}
                placeholder="123 456"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                className="portal-code"
              />
            </Field>
            <Button type="submit" disabled={busy || code.replace(/\D/g, '').length !== 6}>
              {busy ? 'Entrando…' : 'Entrar'}
            </Button>
            <p className="portal-privacy muted small">
              ¿No llegó? Revisa spam o{' '}
              <button type="button" className="link-btn" disabled={busy} onClick={() => void sendCode()}>
                envíalo de nuevo
              </button>
              {' · '}
              <button type="button" className="link-btn" onClick={() => setSentTo(null)}>
                cambiar correo
              </button>
            </p>
          </form>
        ) : config?.nameLogin ? (
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
              {busy ? (config.emailVerify ? 'Enviando…' : 'Entrando…') : config.emailVerify ? 'Enviarme el código' : 'Entrar'}
            </Button>
            <p className="portal-privacy muted small">
              Usamos tu correo para identificarte en tus eventos. No lo compartimos. Las novedades llegan solo si marcas la casilla. Al entrar aceptas los{' '}
              <a href="/terminos">términos y condiciones</a> y la <a href="/privacidad">política de privacidad</a>.
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

// Las finanzas personales ya no son un evento: tienen su propia sección.
const EVENT_CATEGORY_IDS = CATEGORY_IDS.filter((id) => !isPersonal(id))
const eventCategory = (): EventCategory => (isPersonal(readCategory()) ? 'trabajo' : readCategory())

function CreateEvent({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<EventCategory>(eventCategory)
  const [type, setType] = useState<EventType>(() => CATEGORIES[eventCategory()].types[0])
  const [timeTouched, setTimeTouched] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState(() => EVENT_KINDS[CATEGORIES[eventCategory()].types[0]].time)
  const kind = EVENT_KINDS[type]
  const secret = type === 'secreto'
  const personal = isPersonal(category)
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
      // Un amigo secreto se abre en su juego; las finanzas personales, en Presupuesto.
      goTo(secret ? `/e/${slug}#/secreto` : personal ? `/e/${slug}#/presupuesto` : `/e/${slug}`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo crear el evento')
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={personal ? 'Nuevas finanzas' : 'Nuevo evento'}
      description={
        secret
          ? 'Juntay abre el juego: cada quien se apunta, deja su lista de deseos y recibe su papelito secreto.'
          : personal
            ? 'Tu propio presupuesto: escanea boletas y comprobantes y ve cuánto gastaste frente a lo planeado.'
            : 'Tendrá su propia pizarra: actividades, acuerdos, equipo y presupuesto.'
      }
      footer={
        <>
          <span className="spacer" />
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={busy || !name.trim() || code.trim().length < 6}>
            {busy ? 'Creando…' : personal ? 'Crear' : 'Crear evento'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Categoría">
          <CategoryPicker value={category} onChange={pickCategory} ids={EVENT_CATEGORY_IDS} />
        </Field>
        <Field label={personal ? 'Para qué' : 'Tipo de evento'}>
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
        <Field label={personal ? 'Nombre' : 'Nombre del evento'}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind.example} autoFocus />
        </Field>
        {personal ? (
          // De una sola persona: sin hora, lugar ni invitados.
          <Field label={type === 'mes' ? 'Mes' : type === 'ahorro' ? 'Fecha meta' : 'Fecha del viaje'}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        ) : (
          <>
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
          </>
        )}
        <Field
          label={personal ? 'Código' : 'Código del evento'}
          hint={
            personal
              ? 'Es tu llave: solo entra quien lo tenga. Compártelo solo si quieres que alguien más lo vea. Mínimo 6 caracteres.'
              : 'Quien quiera entrar lo necesita. Mínimo 6 caracteres; podrás cambiarlo en Ajustes.'
          }
        >
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={personal ? 'Ej. mis-cuentas-26' : 'Ej. desayuno-nov'} autoComplete="off" />
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

/** Inicio de Finanzas personales: tres caminos en vez de «Crear evento». */
function FinanceHome({ onEvents }: { onEvents: () => void }) {
  const options = [
    { id: 'ingresos', icon: 'download' as const, title: 'Ingresos', hint: 'Sube tu boleta de pago o anótalo a mano: neto y cada concepto.' },
    { id: 'gastos', icon: 'upload' as const, title: 'Gastos', hint: 'Foto o PDF de la boleta: cada producto queda con su rubro.' },
    { id: 'inversiones', icon: 'chart' as const, title: 'Inversiones', hint: 'Depósitos, fondos, acciones: cuánto pusiste y cuánto vale hoy.' },
  ]
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Mis finanzas</h1>
          <p className="muted">¿Qué quieres registrar?</p>
        </div>
        <div className="btn-group">
          <Button variant="outline" icon="users" onClick={onEvents}>
            Mis eventos
          </Button>
          <a className="btn btn-primary btn-md" href="/finanzas#/resumen">
            <Icon name="chart" size={17} /> Ver resumen del mes
          </a>
        </div>
      </div>
      <div className="fin-home">
        {options.map((option) => (
          <a key={option.id} className="fin-home-card" href={`/finanzas#/${option.id}`}>
            <span className="fin-home-icon">
              <Icon name={option.icon} size={24} />
            </span>
            <strong>{option.title}</strong>
            <span className="muted small">{option.hint}</span>
            <span className="event-card-go">
              Entrar <Icon name="arrowRight" size={15} />
            </span>
          </a>
        ))}
      </div>
    </div>
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
  const [linkError, setLinkError] = useState<string | null>(null)
  // Quien eligió «Finanzas personales» ve sus finanzas en vez de la lista de eventos.
  const [area, setArea] = useState<'eventos' | 'finanzas'>(() => (isPersonal(readCategory()) ? 'finanzas' : 'eventos'))
  const switchArea = (next: 'eventos' | 'finanzas') => {
    setArea(next)
    saveCategory(next === 'finanzas' ? 'finanzas' : 'trabajo')
  }

  const load = async () => {
    // Llegó desde el enlace del correo: se comprueba y se limpia la dirección.
    const token = params.get('verificar')
    if (token) {
      params.delete('verificar')
      window.history.replaceState(null, '', window.location.pathname + (params.size ? `?${params}` : '') + window.location.hash)
      try {
        const { next } = await platform.verifyEmail({ token })
        if (next) return goTo(next)
      } catch (err) {
        setLinkError(err instanceof Error ? err.message : 'Ese enlace no es válido. Pide un código nuevo.')
      }
    }
    return platform
      .me()
      .then((me) => {
        // Llegó desde el menú Compartir del celular: va al último evento abierto.
        if (params.has('compartido') && me.user) {
          let last = ''
          try {
            last = localStorage.getItem('juntay.lastEvent') || ''
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
  }

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
          <>
            {linkError ? (
              <p className="gate-error portal-link-error" role="alert">
                {linkError}
              </p>
            ) : null}
            <Login onLogged={() => void load()} />
          </>
        ) : area === 'finanzas' ? (
          <div className="stack">
            <PhotoInbox events={state.events} />
            <FinanceHome onEvents={() => switchArea('eventos')} />
          </div>
        ) : (
          <div className="stack">
            <PhotoInbox events={state.events} />
            <div className="page-head">
              <div>
                <h1>Tus eventos</h1>
                <p className="muted">
                  {state.events.length === 0 ? 'Crea uno o únete con el enlace que te pasó tu equipo.' : 'Entra a la pizarra de cada uno.'}
                </p>
              </div>
              <div className="btn-group">
                <Button variant="soft" icon="wallet" onClick={() => switchArea('finanzas')}>
                  Mis finanzas
                </Button>
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
