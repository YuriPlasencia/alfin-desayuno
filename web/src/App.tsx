import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { AppProvider, useStore } from './store'
import { Icon, Toasts, type IconName } from './components/ui'
import { Dashboard } from './views/Dashboard'
import { Tasks } from './views/Tasks'
import { Agreements } from './views/Agreements'
import { Team } from './views/Team'
import { Budget } from './views/Budget'
import { Settings } from './views/Settings'
import { daysUntil } from './lib/format'
import { summarize } from './lib/stats'

const NAV: { id: string; label: string; icon: IconName }[] = [
  { id: 'inicio', label: 'Inicio', icon: 'home' },
  { id: 'actividades', label: 'Actividades', icon: 'tasks' },
  { id: 'acuerdos', label: 'Acuerdos', icon: 'handshake' },
  { id: 'equipo', label: 'Equipo', icon: 'users' },
  { id: 'presupuesto', label: 'Presupuesto', icon: 'wallet' },
  { id: 'ajustes', label: 'Ajustes', icon: 'settings' },
]

const VIEWS: Record<string, (props: { onNavigate: (tab: string) => void }) => ReactNode> = {
  inicio: Dashboard,
  actividades: () => <Tasks />,
  acuerdos: () => <Agreements />,
  equipo: () => <Team />,
  presupuesto: () => <Budget />,
  ajustes: () => <Settings />,
}

function readTab(): string {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return NAV.some((item) => item.id === hash) ? hash : 'inicio'
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <rect x="3" y="5" width="26" height="20" rx="3" fill="#fff" />
          <path d="M8 12h9M8 17h6" stroke="#1D3FBF" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="22.5" cy="11.5" r="3.2" fill="#E5483A" />
          <circle cx="21" cy="19" r="3.2" fill="#F2B21B" />
          <path d="M11 25v3M21 25v3" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      <span className="brand-text">
        <strong>Al Fin</strong>
        <span>Desayuno</span>
      </span>
    </div>
  )
}

function Gate() {
  const { unlock } = useStore()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    setMessage(await unlock(code))
    setBusy(false)
  }

  return (
    <div className="splash">
      <Brand />
      <form className="gate" onSubmit={(event) => void submit(event)}>
        <h1 className="splash-title">Código del equipo</h1>
        <p className="muted small">Pídeselo a quien coordina el desayuno. Solo lo escribes una vez en este dispositivo.</p>
        <input
          className="input gate-input"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Escribe el código"
          autoComplete="off"
          autoCapitalize="none"
          autoFocus
          aria-label="Código del equipo"
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? 'gate-error' : undefined}
        />
        {message ? (
          <p className="gate-error" id="gate-error" role="alert">
            {message}
          </p>
        ) : null}
        <button className="btn btn-primary btn-md" type="submit" disabled={busy || !code.trim()}>
          {busy ? 'Comprobando…' : 'Entrar a la pizarra'}
        </button>
      </form>
    </div>
  )
}

function Shell() {
  const { data, loading, error, offline, live, locked, actor, setActor, refresh } = useStore()
  const [tab, setTab] = useState(readTab)

  useEffect(() => {
    const onHash = () => setTab(readTab())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (next: string) => {
    setTab(next)
    window.location.hash = `#/${next}`
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const counts = useMemo(
    () => ({
      actividades: data ? data.tasks.filter((task) => task.status !== 'hecha').length : 0,
      acuerdos: data ? data.agreements.filter((item) => item.status !== 'cumplido').length : 0,
      equipo: data ? data.members.length : 0,
    }),
    [data],
  )

  const days = data?.settings.event_date ? daysUntil(data.settings.event_date) : null
  const pct = useMemo(() => (data ? Math.round(summarize(data).overall * 100) : 0), [data])

  if (locked) return <Gate />

  if (!data) {
    return (
      <div className="splash">
        <Brand />
        {loading ? (
          <>
            <span className="spinner" />
            <p className="muted small">Armando la pizarra…</p>
          </>
        ) : (
          <>
            <p className="splash-title">No se pudo cargar la información</p>
            <p className="muted small">{error}</p>
            <button className="btn btn-primary btn-md" onClick={() => void refresh()}>
              <Icon name="refresh" size={17} /> Reintentar
            </button>
          </>
        )}
      </div>
    )
  }

  const View = VIEWS[tab] || Dashboard

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav className="nav">
          {NAV.map((item) => (
            <button key={item.id} className={`nav-item ${tab === item.id ? 'is-active' : ''}`} onClick={() => go(item.id)}>
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
              {item.id === 'actividades' && counts.actividades > 0 ? <span className="nav-badge">{counts.actividades}</span> : null}
              {item.id === 'acuerdos' && counts.acuerdos > 0 ? <span className="nav-badge">{counts.acuerdos}</span> : null}
            </button>
          ))}
        </nav>
        <div className={`sidebar-card ${tab === 'inicio' ? 'is-hidden' : ''}`}>
          <p className="sidebar-days">
            {days === null ? '—' : Math.max(0, days)}
            <span>{days === 1 ? 'día' : 'días'} para el desayuno</span>
          </p>
          <div className="sidebar-meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance del equipo">
            <i style={{ width: `${pct}%` }} />
          </div>
          <p className="sidebar-meta">
            {pct}% listo · {data.settings.guests} invitados · {data.members.length} personas
          </p>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <div className="topbar-left">
            <span className="mobile-brand">
              <Brand />
            </span>
            <span className="topbar-title">{data.settings.event_name}</span>
            {data.settings.event_date ? (
              <span className="topbar-date">
                {data.settings.event_time || ''} · {data.settings.location || 'Lugar por definir'}
              </span>
            ) : null}
          </div>
          <div className="topbar-right">
            <span className={`live-dot ${live ? 'is-live' : ''}`} title={live ? 'Sincronizado en vivo' : 'Reconectando…'} />
            <label className="actor">
              {actor ? <span className="magnet-dot" style={{ background: actor.color }} /> : <span className="magnet-dot is-empty" />}
              <select
                value={actor?.id ?? ''}
                onChange={(event) => {
                  const next = data.members.find((member) => member.id === Number(event.target.value)) || null
                  setActor(next)
                }}
                aria-label="Quién eres"
              >
                <option value="">Elige tu imán</option>
                {data.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="icon-btn only-mobile" onClick={() => go('ajustes')} aria-label="Ajustes">
              <Icon name="settings" size={18} />
            </button>
          </div>
        </header>

        {offline ? (
          <div className="offline-bar">
            <Icon name="wifiOff" size={16} /> Sin conexión con el servidor. Ves lo último guardado y se reconecta solo.
          </div>
        ) : null}

        <main className="content">
          <View onNavigate={go} />
        </main>

        <nav className="bottom-nav">
          {NAV.filter((item) => item.id !== 'ajustes').map((item) => (
            <button key={item.id} className={`bottom-item ${tab === item.id ? 'is-active' : ''}`} onClick={() => go(item.id)}>
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
              {item.id === 'actividades' && counts.actividades > 0 ? <i className="dot-badge">{counts.actividades}</i> : null}
            </button>
          ))}
        </nav>
      </div>

      <Toasts />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
