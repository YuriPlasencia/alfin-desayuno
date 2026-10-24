import { useMemo, useState, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import { useStore } from '../store'
import { api } from '../api'
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Icon,
  IconButton,
  Input,
  Magnet,
  Modal,
  Progress,
  PageHeader,
  Select,
  TextArea,
} from '../components/ui'
import { StepToggle } from '../components/checklist'
import { TaskOptionsModal } from '../components/TaskOptionsModal'
import { AREAS, AREA_COLORS, type Member, type Priority, type Task, type TaskStatus } from '../types'
import { TASK_STATUS_META, deadlineLabel, formatDate } from '../lib/format'
import { taskProgress } from '../lib/stats'

const STATUS_ORDER: TaskStatus[] = ['pendiente', 'en_curso', 'bloqueada', 'hecha']
const VIEW_KEY = 'alfin.tasks.view'

type View = 'tablero' | 'lista'

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'lista' ? 'lista' : 'tablero'
  } catch {
    return 'tablero'
  }
}

/** Ejecuta un cambio y deja que la tarjeta se deslice a su nueva columna. */
async function withTransition(change: () => Promise<unknown>) {
  const doc = document as Document & { startViewTransition?: (cb: () => Promise<void>) => unknown }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!doc.startViewTransition || reduce) {
    await change()
    return
  }
  let done: () => void = () => {}
  const finished = new Promise<void>((resolve) => {
    done = resolve
  })
  doc.startViewTransition(async () => {
    await change()
    flushSync(() => {})
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    done()
  })
  await finished
}

export function Tasks() {
  const { data, actor, mutate } = useStore()
  const [view, setViewState] = useState<View>(readView)
  const [status, setStatus] = useState<'todas' | TaskStatus>('todas')
  const [area, setArea] = useState('todas')
  const [owner, setOwner] = useState('todos')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Task | 'nueva' | null>(null)
  const [optionsModal, setOptionsModal] = useState<{ taskId: number; initialAdding: boolean } | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const setView = (next: View) => {
    setViewState(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      /* sin almacenamiento */
    }
  }

  const tasks = useMemo(() => {
    if (!data) return []
    const term = query.trim().toLowerCase()
    return data.tasks.filter((task) => {
      if (view === 'lista' && status !== 'todas' && task.status !== status) return false
      if (area !== 'todas' && task.area !== area) return false
      if (owner === 'mios') {
        if (!actor || !task.assignees.includes(actor.id)) return false
      } else if (owner !== 'todos' && !task.assignees.includes(Number(owner))) {
        return false
      }
      if (term) {
        const haystack = `${task.title} ${task.detail} ${task.area}`.toLowerCase()
        if (!haystack.includes(term)) return false
      }
      return true
    })
  }, [data, view, status, area, owner, query, actor])

  const counts = useMemo(() => {
    const base: Record<string, number> = { todas: data?.tasks.length ?? 0 }
    for (const key of STATUS_ORDER) base[key] = data ? data.tasks.filter((task) => task.status === key).length : 0
    return base
  }, [data])

  if (!data) return null

  const quickStatus = (task: Task) => {
    const next: Record<TaskStatus, TaskStatus> = {
      pendiente: 'en_curso',
      en_curso: 'hecha',
      bloqueada: 'en_curso',
      hecha: 'en_curso',
    }
    const labels: Record<TaskStatus, string> = {
      pendiente: 'Actividad iniciada',
      en_curso: 'Actividad terminada',
      bloqueada: 'Actividad desbloqueada',
      hecha: 'Actividad reabierta',
    }
    return withTransition(() => mutate(() => api.updateTask(task.id, { status: next[task.status] }), labels[task.status]))
  }

  const removeTask = async (task: Task) => {
    if (!window.confirm(`¿Eliminar la actividad “${task.title}”?`)) return
    await mutate(() => api.deleteTask(task.id), 'Actividad eliminada')
  }

  const card = (task: Task) => (
    <TaskCard
      key={task.id}
      task={task}
      members={data.members}
      meId={actor?.id ?? null}
      compact={view === 'tablero'}
      onAdvance={() => void quickStatus(task)}
      onEdit={() => setEditing(task)}
      onRemove={() => void removeTask(task)}
      onOpenOptions={() => setOptionsModal({ taskId: task.id, initialAdding: false })}
      onOpenAddOption={() => setOptionsModal({ taskId: task.id, initialAdding: true })}
    />
  )

  return (
    <div className="stack">
      <PageHeader
        title="Actividades"
        subtitle={`${counts.hecha} de ${counts.todas} en Hecho · cada imán es una persona responsable`}
        action={
          <Button icon="plus" onClick={() => setEditing('nueva')}>
            Nueva actividad
          </Button>
        }
      />

      <div className="toolbar">
        <div className="toolbar-row">
          <div className="segmented view-switch" role="tablist" aria-label="Vista">
            <button role="tab" aria-selected={view === 'tablero'} className={view === 'tablero' ? 'is-active' : ''} onClick={() => setView('tablero')}>
              <Icon name="columns" size={16} /> Tablero
            </button>
            <button role="tab" aria-selected={view === 'lista'} className={view === 'lista' ? 'is-active' : ''} onClick={() => setView('lista')}>
              <Icon name="list" size={16} /> Lista
            </button>
          </div>
          <button
            className={`chip mine-chip ${owner === 'mios' ? 'is-selected' : ''}`}
            onClick={() => setOwner(owner === 'mios' ? 'todos' : 'mios')}
            disabled={!actor}
            title={actor ? undefined : 'Elige quién eres arriba para usar este filtro'}
          >
            {actor ? <span className="chip-dot" style={{ background: actor.color }} /> : null}
            Solo lo mío
          </button>
        </div>

        {view === 'lista' ? (
          <div className="segmented" role="tablist" aria-label="Filtrar por estado">
            <button className={status === 'todas' ? 'is-active' : ''} onClick={() => setStatus('todas')}>
              Todas <span className="seg-count">{counts.todas}</span>
            </button>
            {STATUS_ORDER.map((key) => (
              <button key={key} className={status === key ? 'is-active' : ''} onClick={() => setStatus(key)}>
                {TASK_STATUS_META[key].label} <span className="seg-count">{counts[key]}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className={`toolbar-filters ${filtersOpen ? 'is-open' : ''}`}>
          <div className="search-row">
            <div className="search">
              <Icon name="search" size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar actividad" aria-label="Buscar actividad" />
            </div>
            <button
              className={`btn btn-outline btn-md filters-toggle ${area !== 'todas' || (owner !== 'todos' && owner !== 'mios') ? 'has-value' : ''}`}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              Filtros
            </button>
          </div>
          <Select value={area} onChange={(event) => setArea(event.target.value)} aria-label="Filtrar por área">
            <option value="todas">Todas las áreas</option>
            {AREAS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
          <Select value={owner} onChange={(event) => setOwner(event.target.value)} aria-label="Filtrar por responsable">
            <option value="todos">Todo el equipo</option>
            <option value="mios">Solo mis actividades</option>
            {data.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon="tasks"
          title="No hay actividades con estos filtros"
          hint="Cambia los filtros o crea una nueva actividad para el equipo."
        />
      ) : view === 'tablero' ? (
        <div className="kanban" aria-label="Tablero de actividades">
          {STATUS_ORDER.map((key) => {
            const column = tasks.filter((task) => task.status === key)
            if (key === 'bloqueada' && column.length === 0) return null
            return (
              <section key={key} className={`kanban-col col-${key}`} aria-label={TASK_STATUS_META[key].label}>
                <h2 className="kanban-head">
                  {key === 'hecha' ? 'Hecho' : TASK_STATUS_META[key].label}
                  <span>{column.length}</span>
                </h2>
                <div className="kanban-list">
                  {column.length === 0 ? <p className="kanban-empty">Nada en esta columna por ahora.</p> : column.map(card)}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <div className="task-grid">{tasks.map(card)}</div>
      )}

      {editing ? (
        <TaskEditor
          task={editing === 'nueva' ? null : editing}
          members={data.members}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {optionsModal && data ? (
        (() => {
          const targetTask = data.tasks.find((t) => t.id === optionsModal.taskId)
          if (!targetTask) return null
          return (
            <TaskOptionsModal
              task={targetTask}
              members={data.members}
              me={actor}
              initialAdding={optionsModal.initialAdding}
              onClose={() => setOptionsModal(null)}
            />
          )
        })()
      ) : null}
    </div>
  )
}

function TaskCard({
  task,
  members,
  meId,
  compact,
  onAdvance,
  onEdit,
  onRemove,
  onOpenOptions,
  onOpenAddOption,
}: {
  task: Task
  members: Member[]
  meId: number | null
  compact: boolean
  onAdvance: () => void
  onEdit: () => void
  onRemove: () => void
  onOpenOptions: () => void
  onOpenAddOption: () => void
}) {
  const owners = members.filter((member) => task.assignees.includes(member.id))
  const due = deadlineLabel(task.due_date)
  const mine = meId !== null && task.assignees.includes(meId)
  // En el tablero solo se despliegan los pasos de lo tuyo y de lo que está en curso.
  const [open, setOpen] = useState(!compact || mine || task.status === 'en_curso')
  const showSteps = !compact || open
  const dueChip = (
    <span className={`due-chip tone-${task.status === 'hecha' ? 'ok' : due.tone}`}>
      <Icon name="calendar" size={13} /> {formatDate(task.due_date)}
      {task.status === 'hecha' || !task.due_date ? null : ` · ${due.text}`}
    </span>
  )
  const options = task.options || []
  const winnerOpt = options.find((o) => o.is_winner)
  const totalVotes = options.reduce((sum, o) => sum + (o.vote_count || 0), 0)

  return (
    <article
      className={`task-card status-${task.status} ${mine ? 'is-mine' : ''}`}
      style={{ viewTransitionName: `task-${task.id}` } as CSSProperties}
    >
      <h3 className="task-title">{task.title}</h3>
      {task.detail ? <p className="task-detail">{task.detail}</p> : null}

      <div className="task-meta">
        {owners.length === 0 ? (
          <span className="muted small">Sin responsable</span>
        ) : (
          owners.map((member) => <Magnet key={member.id} member={member} me={member.id === meId} />)
        )}
        <span className="area-pill">
          <span className="dot" style={{ background: AREA_COLORS[task.area] || '#64748B' }} />
          {task.area}
        </span>
        {task.priority === 'alta' && task.status !== 'hecha' ? <Badge tone="danger">Prioridad alta</Badge> : null}
        {task.status === 'bloqueada' ? <Badge tone="danger">Bloqueada</Badge> : null}
      </div>

      {task.checklist.length > 0 ? (
        <div className="task-checklist">
          <div className="task-progress-head">
            <span className="small">
              <strong>{task.checklist_done}</strong> de {task.checklist_total} pasos
            </span>
            {dueChip}
          </div>
          <Progress value={taskProgress(task)} tone={task.status === 'hecha' ? 'success' : 'brand'} />
          {compact ? (
            <button className="steps-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
              <Icon name="arrowRight" size={14} /> {open ? 'Ocultar pasos' : 'Ver pasos'}
            </button>
          ) : null}
          {showSteps ? (
            <ul className="check-list">
              {task.checklist.map((item) => (
                <li key={item.id}>
                  <StepToggle task={task} item={item} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="task-progress-head">
          <span className="muted small">Sin pasos todavía</span>
          {dueChip}
        </div>
      )}

      {/* Tira visual de cotizaciones y fotos para votación */}
      {options.length > 0 ? (
        <div
          className="task-options-strip"
          onClick={onOpenOptions}
          role="button"
          tabIndex={0}
          title="Ver cotizaciones, fotos y votar la mejor opción"
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpenOptions()}
        >
          <div className="options-strip-header">
            <span className="options-strip-title">
              <Icon name="camera" size={13} /> {options.length} {options.length === 1 ? 'cotización' : 'cotizaciones'}
            </span>
            {winnerOpt ? (
              <span className="strip-badge-winner">
                <Icon name="trophy" size={11} /> Elegida
              </span>
            ) : totalVotes > 0 ? (
              <span className="strip-badge-votes">
                <Icon name="thumbsUp" size={11} /> {totalVotes} {totalVotes === 1 ? 'voto' : 'votos'}
              </span>
            ) : (
              <span className="strip-badge-pending">Votar aquí</span>
            )}
          </div>

          <div className="options-strip-thumbs">
            {options.slice(0, 3).map((opt) => (
              <div
                key={opt.id}
                className={`strip-thumb ${opt.is_winner ? 'is-winner' : ''}`}
                title={`${opt.title} (${opt.vote_count} votos)`}
              >
                {opt.image_url ? (
                  <img src={opt.image_url} alt={opt.title} />
                ) : (
                  <span className="thumb-no-img">
                    <Icon name="image" size={13} />
                  </span>
                )}
                {opt.is_winner ? (
                  <span className="thumb-winner-crown">
                    <Icon name="trophy" size={10} />
                  </span>
                ) : null}
              </div>
            ))}
            {options.length > 3 ? (
              <span className="strip-more">+{options.length - 3}</span>
            ) : null}
            <span className="strip-cta">Ver y votar &rarr;</span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="task-add-option-btn"
          onClick={onOpenAddOption}
          title="Subir foto de cotización o producto encontrado para comparar"
        >
          <Icon name="camera" size={13} /> Subir cotización con foto
        </button>
      )}

      <footer className="task-actions">
        <Button size="sm" variant={task.status === 'hecha' ? 'outline' : task.status === 'en_curso' ? 'success' : 'primary'} onClick={onAdvance}>
          {task.status === 'pendiente' ? 'Empezar' : null}
          {task.status === 'en_curso' ? 'Pasar a Hecho' : null}
          {task.status === 'bloqueada' ? 'Desbloquear' : null}
          {task.status === 'hecha' ? 'Reabrir' : null}
        </Button>
        <span className="spacer" />
        <IconButton icon="pencil" label="Editar actividad" onClick={onEdit} />
        <IconButton icon="trash" label="Eliminar actividad" onClick={onRemove} />
      </footer>
    </article>
  )
}

interface StepDraft {
  key: string
  id?: number
  title: string
  done: boolean
}

let stepSeq = 1
const newStepKey = () => `nuevo-${stepSeq++}`

function TaskEditor({ task, members, onClose }: { task: Task | null; members: Member[]; onClose: () => void }) {
  const { mutate } = useStore()
  const [title, setTitle] = useState(task?.title ?? '')
  const [detail, setDetail] = useState(task?.detail ?? '')
  const [area, setArea] = useState(task?.area ?? AREAS[0])
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'media')
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'pendiente')
  const [dueDate, setDueDate] = useState(task?.due_date ?? '')
  const [assignees, setAssignees] = useState<number[]>(task?.assignees ?? [])
  const [steps, setSteps] = useState<StepDraft[]>(
    task ? task.checklist.map((item) => ({ key: `item-${item.id}`, id: item.id, title: item.title, done: Boolean(item.done) })) : [],
  )
  const [draftStep, setDraftStep] = useState('')
  const [saving, setSaving] = useState(false)

  const toggleAssignee = (id: number) =>
    setAssignees((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))

  const addStep = () => {
    const clean = draftStep.trim()
    if (!clean) return
    setSteps((current) => [...current, { key: newStepKey(), title: clean, done: false }])
    setDraftStep('')
  }

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    const ok = await mutate(async () => {
      const payload = {
        title: title.trim(),
        detail,
        area,
        priority,
        status,
        due_date: dueDate || null,
        member_ids: assignees,
      }
      if (!task) {
        await api.createTask({ ...payload, checklist: steps.map((step) => step.title) })
        return
      }
      await api.updateTask(task.id, payload)
      const keepIds = new Set(steps.filter((step) => step.id).map((step) => step.id))
      for (const original of task.checklist) {
        if (!keepIds.has(original.id)) await api.deleteChecklistItem(original.id)
      }
      for (const step of steps) {
        if (step.id) {
          const original = task.checklist.find((item) => item.id === step.id)
          if (original && (original.title !== step.title || Boolean(original.done) !== step.done)) {
            await api.updateChecklistItem(step.id, { title: step.title, done: step.done })
          }
        } else if (step.title.trim()) {
          await api.addChecklistItem(task.id, step.title.trim())
        }
      }
    }, task ? 'Actividad actualizada' : 'Actividad creada')
    setSaving(false)
    if (ok) onClose()
  }

  const remove = async () => {
    if (!task) return
    if (!window.confirm(`¿Eliminar la actividad “${task.title}”?`)) return
    const ok = await mutate(() => api.deleteTask(task.id), 'Actividad eliminada')
    if (ok) onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={task ? 'Editar actividad' : 'Nueva actividad'}
      description="Define el responsable, la fecha y los pasos del checklist."
      footer={
        <>
          {task ? (
            <Button variant="ghost" icon="trash" onClick={() => void remove()}>
              Eliminar
            </Button>
          ) : null}
          <span className="spacer" />
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={saving || !title.trim()}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Título de la actividad">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej. Comprar insumos del desayuno" autoFocus />
        </Field>
        <Field label="Área">
          <Select value={area} onChange={(event) => setArea(event.target.value)}>
            {AREAS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Responsable(s)" hint="Puedes asignar a varias personas">
          <div className="chip-select">
            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                className={`chip ${assignees.includes(member.id) ? 'is-selected' : ''}`}
                onClick={() => toggleAssignee(member.id)}
              >
                <span className="chip-dot" style={{ background: member.color }} />
                {member.name.split(' ')[0]}
              </button>
            ))}
          </div>
        </Field>
        <div className="form-row">
          <Field label="Prioridad">
            <Select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </Select>
          </Field>
          <Field label="Estado">
            <Select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>
              {STATUS_ORDER.map((key) => (
                <option key={key} value={key}>
                  {TASK_STATUS_META[key].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha límite">
            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
        </div>
        <Field label="Detalle">
          <TextArea rows={3} value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Qué incluye, dónde, con quién…" />
        </Field>
        <Field label="Checklist" hint="Paso a paso para completar la actividad">
          <div className="step-editor">
            {steps.map((step, index) => (
              <div key={step.key} className="step-row">
                <button
                  type="button"
                  className={`checkbox ${step.done ? 'is-checked' : ''}`}
                  onClick={() =>
                    setSteps((current) => current.map((item) => (item.key === step.key ? { ...item, done: !item.done } : item)))
                  }
                  aria-label="Marcar paso"
                >
                  {step.done ? <Icon name="check" size={12} /> : null}
                </button>
                <Input
                  value={step.title}
                  onChange={(event) =>
                    setSteps((current) => current.map((item) => (item.key === step.key ? { ...item, title: event.target.value } : item)))
                  }
                />
                <IconButton
                  icon="x"
                  label={`Quitar paso ${index + 1}`}
                  onClick={() => setSteps((current) => current.filter((item) => item.key !== step.key))}
                />
              </div>
            ))}
            <div className="step-row">
              <span className="checkbox" aria-hidden="true" />
              <Input
                value={draftStep}
                placeholder="Agregar un paso y presionar Enter"
                onChange={(event) => setDraftStep(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addStep()
                  }
                }}
              />
              <IconButton icon="plus" label="Agregar paso" onClick={addStep} />
            </div>
          </div>
        </Field>
      </div>
    </Modal>
  )
}
