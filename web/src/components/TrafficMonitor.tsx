import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { useStore } from '../store'
import { Button, Icon, Magnet } from './ui'
import { relativeTime } from '../lib/format'
import { AREA_COLORS, type PresenceMember, type PresenceStats } from '../types'

function getDeviceIcon(device: string): string {
  if (device === 'iPhone') return '🍏'
  if (device === 'Android') return '🤖'
  if (device === 'Windows PC') return '💻'
  if (device === 'Mac') return '🍎'
  if (device === 'Linux') return '🐧'
  return '🌐'
}

export function TrafficMonitor() {
  const { data, toast } = useStore()
  const [stats, setStats] = useState<PresenceStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'online' | 'today' | 'never'>('all')
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  const loadStats = async (isManual = false) => {
    try {
      if (isManual) setLoading(true)
      const data = await api.getPresenceStats()
      setStats(data)
      setLastUpdated(new Date())
    } catch {
      if (isManual) toast('No se pudo actualizar el tráfico', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadStats()
    const timer = setInterval(() => void loadStats(), 20000)
    return () => clearInterval(timer)
  }, [])

  const filteredMembers = useMemo(() => {
    if (!stats) return []
    const now = Date.now()
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayMs = todayStart.getTime()

    return stats.members.filter((m) => {
      if (filter === 'online') return m.is_online
      if (filter === 'today') {
        const ms = m.last_seen_at ? new Date(m.last_seen_at).getTime() : 0
        return ms >= todayMs
      }
      if (filter === 'never') return !m.last_seen_at
      return true
    })
  }, [stats, filter])

  const neverMembers = useMemo(() => {
    if (!stats) return []
    return stats.members.filter((m) => !m.last_seen_at)
  }, [stats])

  const copyWhatsAppReminder = async () => {
    if (!stats) return
    const names = neverMembers.map((m) => m.name.split(' ')[0]).join(', ')
    const appUrl = window.location.origin + window.location.pathname
    const text = `¡Hola equipo! 👋 Ya está lista la pizarra de *${data?.settings.event_name || 'nuestro evento'}* en Juntada para coordinar actividades, acuerdos y cuotas.

📲 Entren desde su celular o compu aquí:
${appUrl}

👉 Entran con su cuenta de Google, escriben el código del evento y eligen su nombre.
${neverMembers.length > 0 ? `\nFaltan ingresar: ${names}` : ''}

¡Gracias por el apoyo de todos!`

    try {
      await navigator.clipboard.writeText(text)
      toast('¡Mensaje para WhatsApp copiado al portapapeles!', 'ok')
    } catch {
      toast('No se pudo copiar el texto', 'error')
    }
  }

  return (
    <div className="stack">
      {/* Banner de Privacidad Exclusiva */}
      <div className="privacy-banner">
        <div className="privacy-badge">
          <span className="privacy-lock">🔒</span>
          <strong>Monitor Exclusivo de Coordinación</strong>
        </div>
        <p className="small muted">
          Solo tú puedes ver este panel de tráfico y actividad. Es invisible para el resto de miembros y te permite saber si están usando la app, desde qué dispositivo y a quién recordarle ingresar.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="traffic-kpi-grid">
        <div className="traffic-kpi online">
          <div className="kpi-header">
            <span className="live-ping-dot" />
            <span className="kpi-label">Conectados ahora</span>
          </div>
          <div className="kpi-value">{stats ? stats.summary.online : '—'}</div>
          <p className="kpi-sub">
            {stats?.summary.online === 1 ? '1 persona activa en la app' : `${stats?.summary.online ?? 0} personas activas`}
          </p>
        </div>

        <div className="traffic-kpi today">
          <div className="kpi-header">
            <span className="kpi-icon">📱</span>
            <span className="kpi-label">Activos hoy</span>
          </div>
          <div className="kpi-value">{stats ? stats.summary.active_today : '—'}</div>
          <p className="kpi-sub">
            {stats ? `${Math.round((stats.summary.active_today / stats.summary.total) * 100)}% del equipo total` : 'Calculando…'}
          </p>
        </div>

        <div className={`traffic-kpi ${neverMembers.length > 0 ? 'alert' : 'success'}`}>
          <div className="kpi-header">
            <span className="kpi-icon">{neverMembers.length > 0 ? '⏳' : '✅'}</span>
            <span className="kpi-label">Sin ingresar aún</span>
          </div>
          <div className="kpi-value">{stats ? stats.summary.never : '—'}</div>
          <p className="kpi-sub">
            {neverMembers.length > 0 ? 'Pendientes de abrir la app' : '¡Todo el equipo ya ingresó!'}
          </p>
        </div>

        <div className="traffic-kpi total">
          <div className="kpi-header">
            <span className="kpi-icon">👥</span>
            <span className="kpi-label">Total organizadores</span>
          </div>
          <div className="kpi-value">{stats ? stats.summary.total : '—'}</div>
          <p className="kpi-sub">Integrantes registrados</p>
        </div>
      </div>

      {/* Recordatorio WhatsApp si hay pendientes */}
      {neverMembers.length > 0 ? (
        <div className="reminder-card">
          <div className="reminder-info">
            <div className="reminder-title">
              <span className="reminder-bell">📢</span>
              <strong>Faltan ingresar {neverMembers.length} integrantes al sistema</strong>
            </div>
            <p className="small muted">
              Aún no han abierto la app ni elegido su imán:{' '}
              <strong>{neverMembers.map((m) => m.name).join(', ')}</strong>.
            </p>
          </div>
          <Button variant="soft" icon="share" onClick={() => void copyWhatsAppReminder()}>
            Copiar recordatorio para WhatsApp
          </Button>
        </div>
      ) : null}

      {/* Tabla de Integrantes con Filtros */}
      <section className="board" aria-label="Estado de conexión del equipo">
        <header className="board-head">
          <div>
            <h2 className="board-title">Estado de Conexión por Integrante</h2>
            <p className="board-sub">
              Última lectura: {lastUpdated.toLocaleTimeString('es-PE')} · Auto-actualiza cada 20s
            </p>
          </div>
          <Button variant="outline" size="sm" icon="refresh" onClick={() => void loadStats(true)} disabled={loading}>
            {loading ? 'Actualizando…' : 'Actualizar'}
          </Button>
        </header>

        {/* Filtros rápidos */}
        <div className="traffic-filters">
          <button
            type="button"
            className={`filter-chip ${filter === 'all' ? 'is-active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Todos ({stats?.members.length ?? 0})
          </button>
          <button
            type="button"
            className={`filter-chip ${filter === 'online' ? 'is-active' : ''}`}
            onClick={() => setFilter('online')}
          >
            🟢 Conectados ahora ({stats?.summary.online ?? 0})
          </button>
          <button
            type="button"
            className={`filter-chip ${filter === 'today' ? 'is-active' : ''}`}
            onClick={() => setFilter('today')}
          >
            📱 Vistos hoy ({stats?.summary.active_today ?? 0})
          </button>
          <button
            type="button"
            className={`filter-chip ${filter === 'never' ? 'is-active' : ''}`}
            onClick={() => setFilter('never')}
          >
            ⚪ Sin entrar ({stats?.summary.never ?? 0})
          </button>
        </div>

        {/* Lista de Miembros */}
        <div className="traffic-list">
          {filteredMembers.map((member: PresenceMember) => (
            <div key={member.id} className={`traffic-row ${member.is_online ? 'is-online' : ''}`}>
              <div className="traffic-member-info">
                <div className="traffic-avatar-wrap">
                  <Magnet member={{ id: member.id, name: member.name, color: member.color } as any} />
                  {member.is_online ? <span className="online-indicator-dot" /> : null}
                </div>
                <div>
                  <div className="traffic-name-row">
                    <strong className="traffic-name">{member.name}</strong>
                    {member.is_lead ? <span className="badge-lead-tag">Coordina</span> : null}
                  </div>
                  <span className="small muted">{member.role}</span>
                </div>
              </div>

              <div className="traffic-status-col">
                {member.is_online ? (
                  <span className="status-pill is-online">
                    <span className="live-ping-dot" /> En línea ahora
                  </span>
                ) : member.last_seen_at ? (
                  <span className="status-pill is-seen">
                    Visto {relativeTime(member.last_seen_at)}
                  </span>
                ) : (
                  <span className="status-pill is-never">
                    Nunca ha ingresado
                  </span>
                )}
                {member.last_view ? (
                  <span className="traffic-view-tag">En: {member.last_view}</span>
                ) : null}
              </div>

              <div className="traffic-device-col">
                {member.last_seen_at ? (
                  <span className="device-chip">
                    <span className="device-icon">{getDeviceIcon(member.device)}</span>
                    <span>{member.device}</span>
                  </span>
                ) : (
                  <span className="small muted">—</span>
                )}
              </div>

              <div className="traffic-metrics-col">
                <span className="visits-count" title="Sesiones o páginas visitadas">
                  <strong>{member.total_visits}</strong> {member.total_visits === 1 ? 'visita' : 'visitas'}
                </span>
                <span className="small muted">
                  {member.actions_count} {member.actions_count === 1 ? 'acción' : 'acciones'}
                </span>
              </div>
            </div>
          ))}

          {filteredMembers.length === 0 ? (
            <div className="empty-traffic">
              <p className="muted small">No hay integrantes en esta categoría por el momento.</p>
            </div>
          ) : null}
        </div>
      </section>

      {/* Historial en Vivo de Visitas (Audit Log de Presencia) */}
      {stats && stats.recent_views.length > 0 ? (
        <section className="board" aria-label="Historial de navegación">
          <header className="board-head">
            <div>
              <h2 className="board-title">Historial de Navegación en Vivo</h2>
              <p className="board-sub">Últimas 20 pantallas visitadas por los miembros del equipo</p>
            </div>
            <span className="live-pill">
              <span className="live-ping-dot" /> Tiempo Real
            </span>
          </header>

          <div className="recent-views-list">
            {stats.recent_views.map((view) => (
              <div key={view.id} className="recent-view-item">
                <div className="recent-view-left">
                  <span className="device-mini-icon">{getDeviceIcon(view.device)}</span>
                  <div>
                    <strong className="recent-member-name">{view.member_name}</strong>
                    <span className="recent-view-name">abrió la sección <strong>{view.view_name}</strong></span>
                  </div>
                </div>
                <div className="recent-view-right">
                  <span className="device-label-mini">{view.device}</span>
                  <span className="small muted">{relativeTime(view.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
