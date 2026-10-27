import { useMemo, useRef, useState, type CSSProperties } from 'react'
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
import { compressImageFile } from '../lib/image'
import { AREAS, AREA_COLORS, type Member, type Priority, type Task, type TaskOption, type TaskStatus } from '../types'
import { TASK_STATUS_META, deadlineLabel, formatDate, money } from '../lib/format'
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
              <Icon name="camera" size={13} /> {options.length} {options.length === 1 ? 'opción' : 'opciones'}
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
          title="Subir foto si encuentras opciones"
        >
          <Icon name="camera" size={13} /> Subir foto
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

  // Opciones e imágenes de cotizaciones
  const [options, setOptions] = useState<TaskOption[]>(task?.options || [])
  const [draftPhoto, setDraftPhoto] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftPrice, setDraftPrice] = useState('')
  const [draftDetail, setDraftDetail] = useState('')
  const [compressing, setCompressing] = useState(false)
  const [uploadingOption, setUploadingOption] = useState(false)
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setCompressing(true)
      const compressed = await compressImageFile(file, 900, 0.75)
      setDraftPhoto(compressed)
      setDraftTitle(`Opción ${options.length + 1}`)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al procesar la imagen')
    } finally {
      setCompressing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const savePhotoOption = async () => {
    if (!draftPhoto || !draftTitle.trim()) return
    const cleanTitle = draftTitle.trim()
    const parsedPrice = draftPrice ? parseFloat(draftPrice) : 0
    const cleanDetail = draftDetail.trim()

    if (task) {
      setUploadingOption(true)
      let createdOpt: TaskOption | null = null
      const ok = await mutate(
        async () => {
          const res = await api.createTaskOption(task.id, {
            title: cleanTitle,
            price: parsedPrice,
            detail: cleanDetail,
            image_url: draftPhoto,
          })
          createdOpt = res.option
        },
        'Imagen y opción agregada',
      )
      setUploadingOption(false)
      if (ok && createdOpt) {
        setOptions((cur) => [...cur, createdOpt!])
      }
    } else {
      setOptions((cur) => [
        ...cur,
        {
          id: -Date.now(),
          task_id: 0,
          title: cleanTitle,
          price: parsedPrice,
          detail: cleanDetail,
          image_url: draftPhoto,
          created_by: null,
          created_by_name: 'Tú',
          is_winner: 0,
          created_at: new Date().toISOString(),
          votes: [],
          vote_count: 0,
        },
      ])
    }

    setDraftPhoto(null)
    setDraftTitle('')
    setDraftPrice('')
    setDraftDetail('')
  }

  const removeOption = async (optId: number) => {
    if (!window.confirm('¿Eliminar esta imagen/opción?')) return
    if (task && optId > 0) {
      await mutate(() => api.deleteTaskOption(optId), 'Imagen eliminada')
    }
    setOptions((cur) => cur.filter((o) => o.id !== optId))
  }

  const toggleWinner = async (option: TaskOption) => {
    if (!task || option.id < 0) return
    const nextWinner = option.is_winner ? false : true
    await mutate(
      () => api.setOptionWinner(option.id, nextWinner),
      nextWinner ? `“${option.title}” elegida como ganadora` : 'Opción desmarcada',
    )
    setOptions((cur) =>
      cur.map((o) => ({
        ...o,
        is_winner: nextWinner ? (o.id === option.id ? 1 : 0) : 0,
      })),
    )
  }

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
        const created = await api.createTask({ ...payload, checklist: steps.map((step) => step.title) })
        for (const opt of options) {
          if (opt.id < 0) {
            await api.createTaskOption(created.task.id, {
              title: opt.title,
              price: opt.price,
              detail: opt.detail,
              image_url: opt.image_url,
            })
          }
        }
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
    <>
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

        <Field
          label="Fotos de la actividad"
          hint="Sube 2 o más fotos si tienes opciones para que el equipo elija"
        >
          <div className="editor-images-section">
            <div className="editor-images-bar">
              <Button
                type="button"
                icon="camera"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={compressing}
              >
                {compressing ? 'Procesando foto…' : 'Subir foto'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileSelected}
              />
              <span className="small muted">
                {options.length === 0
                  ? 'Sin fotos aún'
                  : `${options.length} ${options.length === 1 ? 'foto subida' : 'fotos subidas'}`}
              </span>
            </div>

            {/* Formulario rápido para la foto recién seleccionada */}
            {draftPhoto ? (
              <div className="editor-draft-box">
                <div
                  className="editor-draft-preview"
                  onClick={() => setPreviewPhoto(draftPhoto)}
                  title="Haz clic para ver foto completa"
                >
                  <img src={draftPhoto} alt="Vista previa de foto" />
                  <span className="draft-zoom-tag">
                    <Icon name="search" size={12} /> Ver grande
                  </span>
                </div>
                <div className="editor-draft-fields">
                  <div className="form-row">
                    <Field label="Nombre o descripción">
                      <Input
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        placeholder="Ej. Opción 1, Kiko, San Antonio..."
                        autoFocus
                      />
                    </Field>
                    <Field label="Precio S/ (opcional)">
                      <Input
                        type="number"
                        step="0.10"
                        min="0"
                        value={draftPrice}
                        onChange={(e) => setDraftPrice(e.target.value)}
                        placeholder="Ej. 160.00"
                      />
                    </Field>
                  </div>
                  <Field label="Nota (opcional)">
                    <Input
                      value={draftDetail}
                      onChange={(e) => setDraftDetail(e.target.value)}
                      placeholder="Detalles adicionales..."
                    />
                  </Field>
                  <div className="editor-draft-actions">
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      onClick={() => void savePhotoOption()}
                      disabled={!draftTitle.trim() || uploadingOption}
                    >
                      {uploadingOption ? 'Guardando…' : 'Guardar foto'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setDraftPhoto(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Lista de imágenes / opciones existentes */}
            {options.length > 0 ? (
              <div className="editor-options-list">
                {options.map((opt) => (
                  <div key={opt.id} className={`editor-opt-card ${opt.is_winner ? 'is-winner' : ''}`}>
                    <div
                      className="editor-opt-img-box"
                      onClick={() => opt.image_url && setPreviewPhoto(opt.image_url)}
                      title={opt.image_url ? 'Haz clic para ampliar la foto' : undefined}
                    >
                      {opt.image_url ? (
                        <img src={opt.image_url} alt={opt.title} />
                      ) : (
                        <div className="editor-opt-no-img">
                          <Icon name="image" size={16} />
                        </div>
                      )}
                      {opt.is_winner ? (
                        <span className="editor-opt-winner-tag">
                          <Icon name="trophy" size={10} /> Elegida
                        </span>
                      ) : null}
                    </div>

                    <div className="editor-opt-content">
                      <div className="editor-opt-header">
                        <strong className="editor-opt-name">{opt.title}</strong>
                        {opt.price > 0 ? (
                          <span className="editor-opt-price-pill">{money(opt.price)}</span>
                        ) : null}
                      </div>

                      {opt.detail ? (
                        <p className="editor-opt-detail-text small muted">{opt.detail}</p>
                      ) : null}

                      <div className="editor-opt-footer">
                        <span className="editor-opt-votes-count small">
                          <Icon name="thumbsUp" size={12} /> {opt.vote_count || 0} {(opt.vote_count || 0) === 1 ? 'voto' : 'votos'}
                        </span>
                        <div className="editor-opt-btns">
                          {task ? (
                            <button
                              type="button"
                              className={`btn-opt-winner ${opt.is_winner ? 'is-winner' : ''}`}
                              onClick={() => void toggleWinner(opt)}
                              title={opt.is_winner ? 'Desmarcar como opción elegida' : 'Marcar como opción elegida del equipo'}
                            >
                              <Icon name="trophy" size={12} />
                              {opt.is_winner ? 'Elegida' : 'Elegir'}
                            </button>
                          ) : null}
                          <IconButton
                            icon="trash"
                            label="Eliminar esta foto"
                            onClick={() => void removeOption(opt.id)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
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
    {previewPhoto ? (
      <div className="photo-lightbox" onClick={() => setPreviewPhoto(null)}>
        <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
          <img src={previewPhoto} alt="Imagen ampliada" className="lightbox-img" />
          <button
            type="button"
            className="lightbox-close"
            onClick={() => setPreviewPhoto(null)}
            aria-label="Cerrar imagen"
          >
            <Icon name="x" size={24} />
          </button>
        </div>
      </div>
    ) : null}
    </>
  )
}
