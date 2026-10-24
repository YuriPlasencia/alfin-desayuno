import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import { Button, Icon, Magnet, Progress } from '../components/ui'
import { StepToggle } from '../components/checklist'
import { HelpPicker } from '../components/help'
import { myPlate, sinceVisit, summarize, taskProgress, todayCount } from '../lib/stats'
import { daysUntil, deadlineLabel, formatDate, formatLongDate, money, parseDate, plural, relativeTime } from '../lib/format'
import { AREA_COLORS, type TaskStatus } from '../types'

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'pendiente', label: 'Pendiente' },
  { status: 'en_curso', label: 'En curso' },
  { status: 'hecha', label: 'Hecho' },
]

const RUNWAY_SCHEDULE = [
  { id: 1, time: '06:30', title: 'Recepción de pan y encendido de cocina', detail: 'Panceta, tamales y cafeteras listas.', leads: 'Diego H. y Rosa Q.', area: 'Cocina' },
  { id: 2, time: '07:15', title: 'Montaje de 10 mesas, vajilla y cubiertos', detail: '8 puestos por mesa con servilleteros.', leads: 'Marco V. y Sandra C.', area: 'Logística' },
  { id: 3, time: '08:00', title: 'Apertura de puertas y bienvenida a los 80', detail: 'Recepción en puerta y ubicación.', leads: 'Ana T. y Fiorella N.', area: 'Coordinación' },
  { id: 4, time: '08:30', title: 'Servicio de chicharrón, tamales y café', detail: 'Salida caliente por bandejas continuas.', leads: 'Yuli C. y Kevin F.', area: 'Servicio' },
  { id: 5, time: '09:15', title: 'Dinámica de integración bancaria cruzada', detail: 'Juegos rápidos entre áreas y rompehielos.', leads: 'Luis R. y Bruno C.', area: 'Dinámicas' },
  { id: 6, time: '10:00', title: 'Palabras de líderes, foto grupal y aplausos', detail: 'Foto oficial de los 80 colaboradores.', leads: 'Ana T. y Patricia L.', area: 'Comunicación' },
  { id: 7, time: '10:30', title: 'Limpieza final, residuos y entrega de local', detail: 'Clasificación de desechos y vajilla.', leads: 'Andrés P. y Jorge S.', area: 'Servicio' },
]

const QUICK_ALERTS = [
  '🥖 Mesas piden reposición de pan con chicharrón',
  '☕ Se está agotando el café pasado en barra',
  '🧊 Falta hielo o vasos biodegradables en mesas',
  '🧹 Apoyo urgente con limpieza en salón',
  '🔊 Micrófono / sonido requiere ajuste',
]

const KUDO_STICKERS = ['🥐', '☕', '👏', '⭐', '🥖', '🎉']

const shortDate = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short' })

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export function Dashboard({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { data, actor, lastVisit, toast } = useStore()
  const [dayMode, setDayMode] = useState(false)
  const [runwayChecks, setRunwayChecks] = useState<Record<number, boolean>>({})
  const [showSos, setShowSos] = useState(false)
  const [kudoNote, setKudoNote] = useState('')
  const [kudoSticker, setKudoSticker] = useState('🥐')
  const [sendingKudo, setSendingKudo] = useState(false)

  const summary = useMemo(() => (data ? summarize(data) : null), [data])
  const plate = useMemo(() => (data ? myPlate(data, actor?.id) : []), [data, actor])
  const news = useMemo(() => (data ? sinceVisit(data, lastVisit, actor?.id) : null), [data, lastVisit, actor])
  const feed = useMemo(
    () => (data ? [...data.log].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10) : []),
    [data],
  )
  if (!data || !summary) return null

  const { settings, members } = data
  const days = daysUntil(settings.event_date)
  const isToday = days === 0
  const eventDate = parseDate(settings.event_date)
  const pct = Math.round(summary.overall * 100)
  const today = todayCount(data)
  const steps = plate.flatMap(({ task, pending }) => pending.map((item) => ({ task, item })))
  const nextSteps = steps.slice(0, 3)
  const openWithoutSteps = plate.filter((entry) => entry.pending.length === 0)
  const blocked = data.tasks.filter((task) => task.status === 'bloqueada')
  const freshIds = new Set(news?.entries.map((entry) => entry.id))

  const activeMode = dayMode || isToday

  const triggerSos = async (alertText: string) => {
    const who = actor?.name || 'Alguien del equipo'
    try {
      await api.logActivity({
        entity: 'alerta',
        action: 'sos',
        detail: `🚨 ${who}: ${alertText}`,
      })
      toast(`Alerta emitida: “${alertText}”`, 'ok')
      setShowSos(false)
    } catch {
      toast('No se pudo enviar la alerta', 'error')
    }
  }

  const toggleRunwayStep = (id: number) => {
    setRunwayChecks((prev) => {
      const next = !prev[id]
      const step = RUNWAY_SCHEDULE.find((s) => s.id === id)
      if (step) {
        api.logActivity({
          entity: 'runway',
          action: next ? 'hecho' : 'desmarcado',
          detail: `${actor?.name || 'Alguien'} marcó como ${next ? 'completado' : 'pendiente'} el bloque “${step.time} ${step.title}”`,
        }).catch(() => {})
      }
      return { ...prev, [id]: next }
    })
  }

  const sendKudo = async () => {
    if (!kudoNote.trim()) return
    const who = actor?.name || 'Compañero Alfin'
    setSendingKudo(true)
    try {
      await api.logActivity({
        entity: 'kudos',
        action: 'reconocimiento',
        detail: `${kudoSticker} ${who}: “${kudoNote.trim()}”`,
      })
      setKudoNote('')
      toast('¡Agradecimiento publicado en la pizarra!', 'win')
    } catch {
      toast('No se pudo enviar el reconocimiento', 'error')
    } finally {
      setSendingKudo(false)
    }
  }

  return (
    <div className="stack">
      <section className="board board-hero" aria-label="Resumen del desayuno">
        <div className="board-head">
          <div>
            <div className="title-row">
              <h1 className="board-title">Desayuno · {eventDate ? shortDate.format(eventDate).replace('.', '') : 'fecha por definir'}</h1>
              <button
                className={`runway-toggle-btn ${activeMode ? 'is-active' : ''}`}
                onClick={() => setDayMode(!activeMode)}
                title="Activar vista de escaleta y urgencias para el día del desayuno"
              >
                <Icon name="sparkles" size={15} />
                <span>{activeMode ? 'Modo Día D activo' : 'Ver Modo Día D'}</span>
              </button>
            </div>
            <p className="board-sub">
              {formatLongDate(settings.event_date)} · {settings.event_time || 'Hora por definir'} · {settings.location || 'Lugar por definir'}
            </p>
          </div>
          <div className="countdown" aria-label={days === null ? 'Fecha por definir' : `Faltan ${days} días`}>
            <strong>{days === null ? '—' : Math.max(0, days)}</strong>
            <span>{days === 1 ? 'día' : 'días'}</span>
          </div>
        </div>

        <div className="team-meter">
          <div className="team-meter-row">
            <p>
              <strong>{pct}%</strong> listo · {summary.checklistDone} de {summary.checklistTotal} pasos
            </p>
            <p className="muted small">{today === 0 ? 'Aún nadie movió nada hoy' : today === 1 ? 'Hoy va 1 movimiento' : `Hoy van ${today} movimientos`}</p>
          </div>
          <Progress value={summary.overall} />
          <p className="ledger-line">
            <button onClick={() => onNavigate('acuerdos')}>
              Acuerdos <strong>{summary.agreements.acordado + summary.agreements.cumplido}/{summary.agreements.total}</strong>
            </button>
            <button onClick={() => onNavigate('presupuesto')}>
              Caja <strong className={summary.budget.saldo < 0 ? 'danger-text' : ''}>{money(summary.budget.saldo)}</strong>
            </button>
            <button onClick={() => onNavigate('equipo')}>
              Invitados <strong>{settings.guests}</strong>
            </button>
          </p>
        </div>

        {actor ? (
          <div className="my-zone">
            <div className="my-zone-head">
              <Magnet member={actor} me />
              <p>
                {steps.length > 0 ? (
                  <>
                    {greeting()}, te {steps.length === 1 ? 'toca' : 'tocan'} <strong>{plural(steps.length, 'paso', 'pasos')}</strong>
                  </>
                ) : openWithoutSteps.length > 0 ? (
                  <>
                    {greeting()}: tus pasos están listos, falta cerrar{' '}
                    <strong>{plural(openWithoutSteps.length, 'actividad', 'actividades')}</strong>
                  </>
                ) : data.tasks.some((task) => task.status !== 'hecha') ? (
                  <>
                    {greeting()}, estás libre. <strong>Elige en qué actividad quieres ayudar:</strong>
                  </>
                ) : (
                  <>{greeting()}: no tienes nada pendiente. ¡Bien!</>
                )}
              </p>
            </div>
            {nextSteps.length > 0 ? (
              <ul className="my-steps">
                {nextSteps.map(({ task, item }) => {
                  const due = deadlineLabel(task.due_date)
                  return (
                    <li key={item.id}>
                      <StepToggle task={task} item={item} showTask />
                      {task.due_date ? <span className={`due-chip tone-${due.tone}`}>{due.text}</span> : null}
                    </li>
                  )
                })}
              </ul>
            ) : null}
            {plate.length === 0 ? <HelpPicker actor={actor} tasks={data.tasks} members={members} /> : null}
            {steps.length > nextSteps.length || openWithoutSteps.length > 0 ? (
              <Button variant="ghost" size="sm" icon="arrowRight" onClick={() => onNavigate('actividades')}>
                Ver tus {plural(steps.length, 'paso', 'pasos')} en el tablero
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="my-zone is-empty">
            <p>
              <strong>Pon tu imán en la pizarra.</strong> Elige tu nombre arriba y verás qué te toca; tus cambios quedarán firmados.
            </p>
          </div>
        )}

        {activeMode ? (
          <div className="runway-board">
            <div className="runway-head">
              <div>
                <span className="runway-tag">
                  <span className="live-dot is-live" /> EN VIVO · DÍA DEL DESAYUNO
                </span>
                <h2 className="runway-title">Escaleta y coordinación horaria</h2>
                <p className="small muted">
                  {summary.checklistDone} de {summary.checklistTotal} tareas listas · 80 invitados
                </p>
              </div>
              <div className="runway-actions">
                <Button variant={showSos ? 'outline' : 'danger'} icon="alert" onClick={() => setShowSos(!showSos)}>
                  {showSos ? 'Cerrar auxilio' : '🚨 Pedir auxilio'}
                </Button>
              </div>
            </div>

            {showSos ? (
              <div className="sos-panel">
                <p className="sos-title">
                  <strong>¿Necesitas apoyo en tu mesa o cocina?</strong> Toca una opción para alertar al equipo en vivo:
                </p>
                <div className="sos-grid">
                  {QUICK_ALERTS.map((alertText) => (
                    <button key={alertText} className="sos-btn" onClick={() => void triggerSos(alertText)}>
                      {alertText}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="runway-contacts">
              <span className="small muted">Líderes de guardia:</span>
              <a href="tel:987654321" className="phone-chip">
                <Icon name="phone" size={13} /> Ana Torres (Coordinación)
              </a>
              <a href="tel:944556677" className="phone-chip">
                <Icon name="phone" size={13} /> Diego Huamán (Cocina)
              </a>
              <a href="tel:998112233" className="phone-chip">
                <Icon name="phone" size={13} /> Carla Mendoza (Caja)
              </a>
            </div>

            <ul className="runway-list">
              {RUNWAY_SCHEDULE.map((item) => {
                const isDone = Boolean(runwayChecks[item.id])
                return (
                  <li key={item.id} className={`runway-item ${isDone ? 'is-done' : ''}`}>
                    <span className="runway-time">{item.time}</span>
                    <div className="runway-body">
                      <div className="runway-item-head">
                        <strong>{item.title}</strong>
                        <span className="area-pill small">
                          <span className="dot" style={{ background: AREA_COLORS[item.area] || '#64748b' }} />
                          {item.area}
                        </span>
                      </div>
                      <p className="small muted">{item.detail}</p>
                      <p className="tiny muted">Responsables: {item.leads}</p>
                    </div>
                    <button
                      className={`runway-check-btn ${isDone ? 'is-checked' : ''}`}
                      onClick={() => toggleRunwayStep(item.id)}
                      aria-label={`Marcar bloque de ${item.time}`}
                    >
                      {isDone ? <Icon name="check" size={16} /> : <span className="empty-box" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        <div className="mini-board" aria-label="Columnas del equipo">
          {COLUMNS.map((column) => {
            const tasks = data.tasks.filter((task) =>
              column.status === 'pendiente' ? task.status === 'pendiente' || task.status === 'bloqueada' : task.status === column.status,
            )
            return (
              <div key={column.status} className={`mini-col col-${column.status}`}>
                <h3>
                  {column.label} <span>{tasks.length}</span>
                </h3>
                <ul>
                  {tasks.slice(0, 3).map((task) => {
                    const owners = members.filter((member) => task.assignees.includes(member.id))
                    return (
                      <li key={task.id} className={task.status === 'bloqueada' ? 'is-blocked' : ''}>
                        <span className="mini-title">{task.title}</span>
                        <span className="magnet-row">
                          {owners.slice(0, 4).map((owner) => (
                            <span key={owner.id} className="magnet-pin" style={{ background: owner.color }} title={owner.name} />
                          ))}
                        </span>
                      </li>
                    )
                  })}
                  {tasks.length > 3 ? <li className="mini-more">+{tasks.length - 3} más</li> : null}
                  {tasks.length === 0 ? <li className="mini-more">Vacío</li> : null}
                </ul>
              </div>
            )
          })}
        </div>
      </section>

      {news && news.entries.length > 0 ? (
        <section className="news" aria-label="Desde tu última visita">
          <Icon name="sparkles" size={18} />
          <p>
            <strong>Desde tu última visita</strong> {news.people.slice(0, 3).join(', ')}
            {news.people.length > 3 ? ` y ${news.people.length - 3} más` : ''} hicieron{' '}
            {plural(news.entries.length, 'cambio', 'cambios')}.
          </p>
          <Button variant="ghost" size="sm" onClick={() => document.getElementById('actividad')?.scrollIntoView({ behavior: 'smooth' })}>
            Ver
          </Button>
        </section>
      ) : null}

      {blocked.length > 0 ? (
        <section className="alert-strip" aria-label="Actividades bloqueadas">
          <Icon name="alert" size={18} />
          <p>
            <strong>{plural(blocked.length, 'actividad bloqueada', 'actividades bloqueadas')}:</strong>{' '}
            {blocked.map((task) => task.title).join(' · ')}
          </p>
          <Button variant="ghost" size="sm" onClick={() => onNavigate('actividades')}>
            Resolver
          </Button>
        </section>
      ) : null}

      <div className="columns-2">
        <div className="stack">
          <section className="card">
            <header className="card-head">
              <h2>Vence pronto</h2>
              <Button variant="ghost" size="sm" icon="arrowRight" onClick={() => onNavigate('actividades')}>
                Tablero
              </Button>
            </header>
            <ul className="due-list">
              {summary.upcoming.length === 0 ? (
                <li className="muted small">No hay actividades con fecha pendientes.</li>
              ) : (
                summary.upcoming.map((task) => {
                  const due = deadlineLabel(task.due_date)
                  const owners = members.filter((member) => task.assignees.includes(member.id))
                  return (
                    <li key={task.id} className="due-item">
                      <div className="due-main">
                        <p className="due-title">{task.title}</p>
                        <div className="due-meta">
                          {owners.map((owner) => (
                            <Magnet key={owner.id} member={owner} me={owner.id === actor?.id} />
                          ))}
                          <span className="muted small">
                            {formatDate(task.due_date)} · {Math.round(taskProgress(task) * 100)}%
                          </span>
                        </div>
                      </div>
                      <span className={`due-chip tone-${due.tone}`}>{due.text}</span>
                    </li>
                  )
                })
              )}
            </ul>
          </section>

          <section className="card" id="actividad">
            <header className="card-head">
              <h2>Lo último en la pizarra</h2>
            </header>
            <ul className="log-list">
              {feed.map((entry) => {
                const member = members.find((item) => item.id === entry.actor_id)
                const fresh = freshIds.has(entry.id)
                return (
                  <li key={entry.id} className={fresh ? 'is-new' : ''}>
                    <p className="log-detail">{entry.detail}</p>
                    <p className="log-meta">
                      {member ? <Magnet member={member} me={member.id === actor?.id} /> : <span className="muted small">{entry.actor_name}</span>}
                      <span className="muted small">{relativeTime(entry.created_at)}</span>
                      {fresh ? <span className="new-tag">nuevo</span> : null}
                    </p>
                  </li>
                )
              })}
              {feed.length === 0 ? <li className="muted small">Todavía no hay movimientos.</li> : null}
            </ul>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <header className="card-head">
              <h2>Por área</h2>
            </header>
            <ul className="area-list">
              {summary.areas.map((area) => (
                <li key={area.area}>
                  <div className="area-row">
                    <span className="area-name">
                      <span className="dot" style={{ background: AREA_COLORS[area.area] || '#64748B' }} />
                      {area.area}
                    </span>
                    <span className="muted small tabular">
                      {Math.round(area.progress * 100)}% · {area.done}/{area.total}
                    </span>
                  </div>
                  <Progress value={area.progress} tone={area.progress === 1 ? 'success' : 'brand'} />
                </li>
              ))}
            </ul>
          </section>

          <section className="card kudos-card">
            <header className="card-head">
              <div>
                <h2>Muro de Reconocimientos</h2>
                <p className="small muted">Reconoce a tus compañeros de cocina, servicio y logística</p>
              </div>
              <span className="lead-star" title="Kudos y agradecimientos">
                <Icon name="heart" size={16} />
              </span>
            </header>
            <div className="kudos-form">
              <div className="kudo-stickers">
                {KUDO_STICKERS.map((stk) => (
                  <button
                    key={stk}
                    type="button"
                    className={`sticker-btn ${kudoSticker === stk ? 'is-active' : ''}`}
                    onClick={() => setKudoSticker(stk)}
                  >
                    {stk}
                  </button>
                ))}
              </div>
              <div className="kudo-input-row">
                <input
                  className="input kudo-input"
                  value={kudoNote}
                  onChange={(e) => setKudoNote(e.target.value)}
                  placeholder="Ej. ¡El chicharrón y el café quedaron de 10!"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void sendKudo()
                  }}
                />
                <Button size="sm" onClick={() => void sendKudo()} disabled={sendingKudo || !kudoNote.trim()}>
                  Enviar
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <p className="muted tiny">Actualizado {relativeTime(data.serverTime)}</p>
    </div>
  )
}
