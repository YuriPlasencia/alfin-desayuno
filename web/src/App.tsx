import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppProvider, useStore } from './store'
import { api, platform } from './api'
import { Avatar, Icon, Toasts, type IconName } from './components/ui'
import { Brand } from './components/brand'
import { ClaimScreen, JoinScreen, NoEventScreen } from './components/access'

import { Dashboard } from './views/Dashboard'
import { Tasks } from './views/Tasks'
import { Agreements } from './views/Agreements'
import { Team } from './views/Team'
import { Budget } from './views/Budget'
import { Settings } from './views/Settings'
import { Portal } from './views/Portal'
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

/** Tu cuenta: mis eventos y salir. */
function AccountMenu() {
  const { data, actor } = useStore()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => !box.current?.contains(event.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const user = data?.me?.user
  if (!user) return null
  const person = actor ?? { name: user.name, color: '#1D3FBF', photo_url: user.picture }
  return (
    <div className="account" ref={box}>
      <button type="button" className="actor" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Avatar member={person} size="sm" />
        <span className="account-name">{person.name.split(' ')[0]}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open ? (
        <div className="share-menu account-menu" role="menu">
          <p className="account-who">
            <strong>{user.name}</strong>
            {user.email ? <span className="muted small">{user.email}</span> : null}
          </p>
          <a role="menuitem" className="share-item" href="/">
            <Icon name="home" size={15} /> Mis eventos
          </a>
          <button
            role="menuitem"
            type="button"
            className="share-item"
            onClick={() => void platform.logout().finally(() => (window.location.href = '/'))}
          >
            <Icon name="x" size={15} /> Cerrar sesión
          </button>
        </div>
      ) : null}
    </div>
  )
}

function Shell() {
  const { slug, data, loading, error, offline, live, gate, actor, refresh } = useStore()
  const [tab, setTab] = useState(readTab)

  useEffect(() => {
    const onHash = () => setTab(readTab())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (gate === 'login') window.location.href = `/?next=${encodeURIComponent(`/e/${slug}`)}`
  }, [gate, slug])

  useEffect(() => {
    if (!actor?.id) return
    const tabName = tab.charAt(0).toUpperCase() + tab.slice(1)
    api.pingPresence(tabName).catch(() => {})
    const timer = setInterval(() => {
      api.pingPresence(tabName).catch(() => {})
    }, 45000)
    return () => clearInterval(timer)
  }, [actor?.id, tab])

  useEffect(() => {
    if (data?.settings.event_name) document.title = `${data.settings.event_name} · Juntada`
  }, [data?.settings.event_name])

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

  if (gate === 'join') return <JoinScreen slug={slug} />
  if (gate === 'no-event') return <NoEventScreen />
  if (gate === 'claim' && data?.me) return <ClaimScreen />

  if (!data || gate === 'login') {
    return (
      <div className="splash">
        <Brand />
        {loading || gate === 'login' ? (
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
        <a href="/" className="brand-link" title="Mis eventos">
          <Brand subtitle={data.settings.event_name} />
        </a>
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
            <span>{days === 1 ? 'día' : 'días'} para el evento</span>
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
            <a href="/" className="mobile-brand" title="Mis eventos">
              <Brand />
            </a>
            <span className="topbar-title">{data.settings.event_name}</span>
            {data.settings.event_date ? (
              <span className="topbar-date">
                {data.settings.event_time || ''} · {data.settings.location || 'Lugar por definir'}
              </span>
            ) : null}
          </div>
          <div className="topbar-right">
            <span className={`live-dot ${live ? 'is-live' : ''}`} title={live ? 'Sincronizado en vivo' : 'Reconectando…'} />
            <AccountMenu />
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

/** /e/<slug> es un evento; cualquier otra dirección es la portada de Juntada. */
function eventSlugFromPath(): string | null {
  const match = window.location.pathname.match(/^\/e\/([a-z0-9-]+)\/?$/)
  return match ? match[1] : null
}

export default function App() {
  const slug = eventSlugFromPath()
  if (!slug) return <Portal />
  return (
    <AppProvider slug={slug}>
      <Shell />
    </AppProvider>
  )
}
