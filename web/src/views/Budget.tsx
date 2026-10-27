import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import { compressImageFile } from '../lib/image'
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Icon,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Progress,
  Select,
  TextArea,
} from '../components/ui'
import { isCuota, summarize } from '../lib/stats'
import { CUOTA, CuotaModal, CuotasPanel, FlowView, ReceiptViewer, ValidateButton, findPayer, scanVoucher } from '../components/voucher'
import { takePhotoForExpense, takeSharedFile } from '../lib/shared'
import { formatDate, getTreasurer, money, plural } from '../lib/format'
import type { BudgetItem, BudgetKind, BudgetStatus, Member, Task, TaskOption } from '../types'

type MainTab = 'inicial' | 'ejecucion' | 'tesorero'

type EditorPreset = {
  kind: BudgetKind
  status: BudgetStatus
  stage: 'plan' | 'real'
  ownerId: number | null
  pick: boolean
  concept?: string
  amount?: number
  planId?: number | null
  optionId?: number | null
}

type EditorState = { item: BudgetItem | null; preset?: EditorPreset; file?: File | null } | null

export function Budget() {
  const { data, actor, mutate, toast } = useStore()
  const [mainTab, setMainTab] = useState<MainTab>('ejecucion')
  const [filter, setFilter] = useState<'todos' | BudgetKind | 'flujo'>('todos')
  const [editing, setEditing] = useState<EditorState>(null)
  const [cuota, setCuota] = useState<{ file: File | null } | null>(null)
  const [viewing, setViewing] = useState<BudgetItem | null>(null)
  const [shared, setShared] = useState<File | null>(null)
  const [pendingPhoto, setPendingPhoto] = useState<number | null>(null)

  // Constancia compartida desde Yape, Plin o la galería (menú Compartir del celular).
  useEffect(() => {
    let alive = true
    void takeSharedFile().then((file) => {
      if (alive && file) setShared(file)
    })
    return () => {
      alive = false
    }
  }, [])
  const summary = useMemo(() => (data ? summarize(data) : null), [data])

  // Llegada desde una actividad con "Pasar a gastos".
  const photoRequest = useRef<number | null | undefined>(undefined)
  if (photoRequest.current === undefined) photoRequest.current = takePhotoForExpense()
  useEffect(() => {
    if (photoRequest.current) {
      setPendingPhoto(photoRequest.current)
      photoRequest.current = null
    }
  }, [])
  // Cuando ya están los datos, se abre el gasto armado con esa foto.
  useEffect(() => {
    if (!pendingPhoto || !data) return
    if (!data.tasks.some((task) => task.options?.some((option) => option.id === pendingPhoto))) return
    setPendingPhoto(null)
    setMainTab('ejecucion')
    setFilter('gasto')
    setEditing({
      item: null,
      preset: { kind: 'gasto', status: 'hecho', stage: 'real', ownerId: actor?.id ?? null, pick: false, optionId: pendingPhoto },
    })
  }, [pendingPhoto, data, actor])

  const winningOptions = useMemo(() => {
    if (!data) return []
    const list: { taskTitle: string; option: TaskOption }[] = []
    for (const t of data.tasks) {
      for (const opt of t.options || []) {
        if (opt.is_winner === 1 && opt.price > 0) {
          const already = data.budget.some((b) => b.concept.toLowerCase().includes(opt.title.toLowerCase()))
          if (!already) {
            list.push({ taskTitle: t.title, option: opt })
          }
        }
      }
    }
    return list
  }, [data])

  if (!data || !summary) return null

  const treasurer = getTreasurer(data.settings, data.members)
  const plan = data.budget.filter((item) => item.stage === 'plan')
  const real = data.budget.filter((item) => item.stage !== 'plan')
  const rows = real.filter((item) => (filter === 'todos' || filter === 'flujo' ? true : item.kind === filter))
  // Ejecución: todo lo que se va registrando (ingresos, gastos y su diferencia).
  const realIngresos = real.filter((item) => item.kind === 'ingreso').reduce((acc, item) => acc + item.amount, 0)
  const realGastos = real.filter((item) => item.kind === 'gasto').reduce((acc, item) => acc + item.amount, 0)
  // Al abrir una constancia se muestra la versión al día del movimiento.
  const viewingNow = viewing ? data.budget.find((item) => item.id === viewing.id) || null : null

  const photos = activityPhotos(data.tasks, data.budget)

  const realExpense = (file: File | null = null, from?: BudgetItem, optionId?: number): EditorState => ({
    item: null,
    file,
    preset: {
      kind: 'gasto',
      status: 'hecho',
      stage: 'real',
      ownerId: from?.owner_id ?? actor?.id ?? null,
      // Si hay fotos en las actividades, primero se muestran (no se abre la galería de golpe).
      pick: !file && !optionId && photos.length === 0,
      optionId: optionId ?? null,
      concept: from?.concept,
      amount: from ? Math.max(0, from.amount - executedFor(real, from.id)) || undefined : undefined,
      planId: from?.id ?? null,
    },
  })

  const toggle = (item: BudgetItem) =>
    mutate(
      () => api.updateBudget(item.id, { status: item.status === 'hecho' ? 'pendiente' : 'hecho' }),
      item.status === 'hecho' ? 'Marcado como pendiente' : item.kind === 'ingreso' ? 'Ingreso cobrado' : 'Gasto pagado',
    )

  const remove = async (item: BudgetItem) => {
    const label = item.stage === 'plan' ? 'la partida' : ''
    if (!window.confirm(`¿Eliminar ${label} “${item.concept}”?`.replace('  ', ' '))) return
    await mutate(() => api.deleteBudget(item.id), item.stage === 'plan' ? 'Partida eliminada' : 'Movimiento eliminado')
  }

  const copyWhatsAppReport = async () => {
    const tName = treasurer ? treasurer.name : 'Tesorería'
    const tPhone = treasurer?.phone ? ` · *${treasurer.phone}*` : ''

    const text = `🥐 *AL FIN DESAYUNO · REPORTE DE CAJA*
📅 *Evento:* ${data.settings.event_name}
📍 *Lugar:* ${data.settings.location || 'Por definir'}
------------------------------------
💰 *Saldo en caja:* ${money(summary.budget.saldo)}
📥 *Ingresos cobrados:* ${money(summary.budget.cobrado)} de ${money(summary.budget.ingresos)} presupuestados (${Math.round(summary.budget.avanceCobro * 100)}%)
📤 *Gastos pagados:* ${money(summary.budget.pagado)} de ${money(summary.budget.gastos)} presupuestados

📲 *Para cuotas individuales (${money(CUOTA)}):*
Yape / Plin a: ${tName}${tPhone}
(Al yapear, sube tu constancia en la app: Presupuesto → Subir cuota)`

    try {
      await navigator.clipboard.writeText(text)
      toast('¡Reporte copiado para WhatsApp! Pégalo en el grupo.', 'ok')
    } catch {
      toast('No se pudo copiar al portapapeles', 'error')
    }
  }

  return (
    <div className="stack">
      <PageHeader
        title="Presupuesto y Tesorería"
        subtitle="Lo planificado, lo que ya se cobró y pagó, y el saldo en caja"
        action={
          <div className="btn-group">
            <Button icon="camera" onClick={() => setCuota({ file: null })}>
              Subir cuota
            </Button>
            <Button variant="soft" icon="camera" onClick={() => setEditing(realExpense())}>
              Subir gasto
            </Button>
            <Button variant="outline" icon="share" onClick={() => void copyWhatsAppReport()}>
              WhatsApp
            </Button>
          </div>
        }
      />

      <div className="segmented budget-tabs" role="tablist" aria-label="Secciones de presupuesto">
        <button role="tab" aria-selected={mainTab === 'inicial'} className={mainTab === 'inicial' ? 'is-active' : ''} onClick={() => setMainTab('inicial')}>
          Presupuestado <span className="seg-count">{plan.length + 1}</span>
        </button>
        <button role="tab" aria-selected={mainTab === 'ejecucion'} className={mainTab === 'ejecucion' ? 'is-active' : ''} onClick={() => setMainTab('ejecucion')}>
          Presupuesto en ejecución <span className="seg-count">{real.length}</span>
        </button>
        <button role="tab" aria-selected={mainTab === 'tesorero'} className={mainTab === 'tesorero' ? 'is-active' : ''} onClick={() => setMainTab('tesorero')}>
          Tesorero(a) <span className="seg-count">{treasurer ? '✓' : '—'}</span>
        </button>
      </div>

      {mainTab === 'tesorero' ? (
        <TreasurerManager settings={data.settings} members={data.members} currentTreasurer={treasurer} />
      ) : mainTab === 'inicial' ? (
        <>
          <section className="board ledger" aria-label="Presupuestado">
            <div className="ledger-figures">
              <div className="ledger-figure income">
                <span className="budget-label">
                  <Icon name="download" size={16} /> Ingresos presupuestados
                </span>
                <strong>{money(summary.budget.ingresos)}</strong>
                <span className="small">
                  {data.members.length} cuotas de {money(CUOTA)}
                  {summary.budget.ingresos > summary.budget.cuotasPlan ? ' + otros ingresos' : ''}
                </span>
              </div>
              <div className="ledger-figure expense">
                <span className="budget-label">
                  <Icon name="upload" size={16} /> Gastos presupuestados
                </span>
                <strong>{money(summary.budget.gastos)}</strong>
                <span className="small">
                  {plan.filter((item) => item.kind === 'gasto').length} partidas
                </span>
              </div>
              <div className={`ledger-figure balance ${summary.budget.saldoPlan < 0 ? 'is-negative' : ''}`}>
                <span className="budget-label">
                  <Icon name="wallet" size={16} /> Saldo previsto
                </span>
                <strong className={summary.budget.saldoPlan < 0 ? 'danger-text' : ''}>{money(summary.budget.saldoPlan)}</strong>
                <span className="small">{summary.budget.saldoPlan >= 0 ? 'alcanza con lo previsto' : 'faltaría cubrir esta diferencia'}</span>
              </div>
            </div>
            <div className="ledger-meter">
              <div className="team-meter-row">
                <p>
                  <strong>{Math.round(summary.budget.avanceGasto * 100)}%</strong> ejecutado · {money(summary.budget.pagado)} pagado de{' '}
                  {money(summary.budget.gastos)}
                </p>
              </div>
              <Progress value={Math.min(1, summary.budget.avanceGasto)} tone={summary.budget.avanceGasto > 1 ? 'danger' : 'brand'} />
            </div>
          </section>

          {winningOptions.length > 0 ? (
            <div className="budget-quote-import-banner">
              <div className="quote-import-info">
                <span className="quote-import-icon">🏆</span>
                <div>
                  <strong>Hay {winningOptions.length} cotización(es) ganadora(s) de actividades lista(s) para el presupuesto</strong>
                  <p className="tiny muted">{winningOptions.map((w) => `${w.option.title} (${money(w.option.price)})`).join(' · ')}</p>
                </div>
              </div>
              <Button
                variant="soft"
                size="sm"
                icon="plus"
                onClick={async () => {
                  for (const item of winningOptions) {
                    await api.createBudget({
                      kind: 'gasto',
                      stage: 'plan',
                      concept: `${item.option.title} (${item.taskTitle})`,
                      amount: item.option.price,
                      status: 'pendiente',
                      note: `Cotización ganadora de actividad: ${item.taskTitle}`,
                      receipt_url: item.option.image_url || '',
                    })
                  }
                  await mutate(async () => {}, 'Cotizaciones agregadas como partidas')
                }}
              >
                Agregar como partidas
              </Button>
            </div>
          ) : null}

          <PlanTable
            title="Ingresos presupuestados"
            kind="ingreso"
            members={data.members}
            plan={plan}
            real={real}
            onAdd={() => setEditing({ item: null, preset: { kind: 'ingreso', status: 'pendiente', stage: 'plan', ownerId: null, pick: false } })}
            onEdit={(item) => setEditing({ item })}
            onRemove={(item) => void remove(item)}
          />
          <PlanTable
            title="Gastos presupuestados"
            kind="gasto"
            members={data.members}
            plan={plan}
            real={real}
            onAdd={() => setEditing({ item: null, preset: { kind: 'gasto', status: 'pendiente', stage: 'plan', ownerId: null, pick: false } })}
            onEdit={(item) => setEditing({ item })}
            onRemove={(item) => void remove(item)}
            onRegister={(item) => setEditing(realExpense(null, item))}
            onOpenUnplanned={() => {
              setMainTab('ejecucion')
              setFilter('gasto')
            }}
          />
        </>
      ) : (
        <>
          <section className="board ledger" aria-label="Caja real">
            <div className="ledger-figures">
              <div className="ledger-figure income">
                <span className="budget-label">
                  <Icon name="download" size={16} /> Ingresos
                </span>
                <strong>{money(realIngresos)}</strong>
                <span className="small">{plural(real.filter((item) => item.kind === 'ingreso').length, 'registro', 'registros')}</span>
              </div>
              <div className="ledger-figure expense">
                <span className="budget-label">
                  <Icon name="upload" size={16} /> Gastos
                </span>
                <strong>{money(realGastos)}</strong>
                <span className="small">{plural(real.filter((item) => item.kind === 'gasto').length, 'registro', 'registros')}</span>
              </div>
              <div className={`ledger-figure balance ${realIngresos - realGastos < 0 ? 'is-negative' : ''}`}>
                <span className="budget-label">
                  <Icon name="wallet" size={16} /> Saldo disponible
                </span>
                <strong className={realIngresos - realGastos < 0 ? 'danger-text' : ''}>{money(realIngresos - realGastos)}</strong>
                <span className="small">ingresos menos gastos</span>
              </div>
            </div>
          </section>

          <CuotasPanel members={data.members} budget={real} onOpen={setViewing} onPay={() => setCuota({ file: null })} />

          <div className="toolbar-row">
            <div className="segmented">
              <button className={filter === 'todos' ? 'is-active' : ''} onClick={() => setFilter('todos')}>
                Todos <span className="seg-count">{real.length}</span>
              </button>
              <button className={filter === 'ingreso' ? 'is-active' : ''} onClick={() => setFilter('ingreso')}>
                Ingresos <span className="seg-count">{real.filter((item) => item.kind === 'ingreso').length}</span>
              </button>
              <button className={filter === 'gasto' ? 'is-active' : ''} onClick={() => setFilter('gasto')}>
                Gastos <span className="seg-count">{real.filter((item) => item.kind === 'gasto').length}</span>
              </button>
              <button className={filter === 'flujo' ? 'is-active' : ''} onClick={() => setFilter('flujo')}>
                <Icon name="chart" size={15} /> Flujo
              </button>
            </div>
            <span className="spacer" />
            <Button
              variant="outline"
              size="sm"
              icon="plus"
              onClick={() => setEditing({ item: null, preset: { kind: 'gasto', status: 'hecho', stage: 'real', ownerId: actor?.id ?? null, pick: false } })}
            >
              Movimiento sin foto
            </Button>
          </div>

          {filter !== 'ingreso' && photos.length > 0 ? (
            <div className="card">
              <ActivityPhotoStrip
                photos={photos}
                title={`${photos.length === 1 ? 'Hay 1 foto' : `Hay ${photos.length} fotos`} en las actividades sin registrar como gasto. Toca una para registrarla:`}
                onPick={(photo) => setEditing(realExpense(null, undefined, photo.option.id))}
              />
            </div>
          ) : null}

          {filter === 'flujo' ? (
            <FlowView budget={real} members={data.members} onOpen={setViewing} />
          ) : filter === 'ingreso' && rows.length > 0 ? (
            <IncomeTable rows={rows} onOpen={setViewing} onEdit={(item) => setEditing({ item })} onRemove={(item) => void remove(item)} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="wallet"
              title="Todavía no hay movimientos"
              hint="Usa “Subir cuota” para los aportes y “Subir gasto” para cada compra con su boleta."
            />
          ) : (
            <div className="card table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th>Tipo</th>
                    <th>Quién</th>
                    <th>Fecha</th>
                    <th className="right">Monto</th>
                    <th>Estado</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => {
                    const partida = item.plan_id ? plan.find((p) => p.id === item.plan_id) : null
                    return (
                      <tr key={item.id} className={item.status === 'hecho' ? 'is-done' : ''}>
                        <td>
                          <div className="cell-concept-row">
                            <span className="cell-title">{item.concept}</span>
                            {item.has_receipt ? (
                              <button type="button" className="receipt-chip-btn" onClick={() => setViewing(item)} title="Ver la constancia y validarla">
                                <Icon name="camera" size={12} />
                                <span>{item.kind === 'ingreso' ? 'Ver constancia' : 'Ver boleta'}</span>
                              </button>
                            ) : null}
                            <ValidateButton item={item} />
                          </div>
                          {item.note || partida ? (
                            <span className="cell-note">
                              {partida ? `Partida: ${partida.concept}` : ''}
                              {partida && item.note ? ' · ' : ''}
                              {item.note}
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <Badge tone={item.kind === 'ingreso' ? 'success' : 'neutral'}>{item.kind === 'ingreso' ? 'Ingreso' : 'Gasto'}</Badge>
                        </td>
                        <td className="muted">{item.owner_name || '—'}</td>
                        <td className="muted">{item.due_date ? formatDate(item.due_date) : '—'}</td>
                        <td className={`right amount ${item.kind === 'ingreso' ? 'positive' : ''}`}>{money(item.amount)}</td>
                        <td>
                          <button className={`status-toggle ${item.status === 'hecho' ? 'is-on' : ''}`} onClick={() => void toggle(item)}>
                            <span className="status-dot" />
                            {item.status === 'hecho' ? (item.kind === 'ingreso' ? 'Cobrado' : 'Pagado') : 'Pendiente'}
                          </button>
                        </td>
                        <td className="actions-cell">
                          <IconButton icon="pencil" label="Editar movimiento" onClick={() => setEditing({ item })} />
                          <IconButton icon="trash" label="Eliminar movimiento" onClick={() => void remove(item)} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>Neto de la vista</td>
                    <td className="right amount">{money(rows.reduce((acc, item) => acc + (item.kind === 'gasto' ? -item.amount : item.amount), 0))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      {editing ? (
        <BudgetEditor item={editing.item} preset={editing.preset} initialFile={editing.file ?? null} plan={plan} onClose={() => setEditing(null)} />
      ) : null}
      {cuota ? (
        <CuotaModal members={data.members} budget={real} treasurer={treasurer} initialFile={cuota.file} onClose={() => setCuota(null)} />
      ) : null}
      {viewingNow ? <ReceiptViewer item={viewingNow} onClose={() => setViewing(null)} /> : null}
      {shared ? (
        <SharedChoice
          file={shared}
          onClose={() => setShared(null)}
          onCuota={() => {
            setCuota({ file: shared })
            setShared(null)
          }}
          onGasto={() => {
            setEditing(realExpense(shared))
            setShared(null)
          }}
        />
      ) : null}
    </div>
  )
}

export interface ActivityPhoto {
  option: TaskOption
  task: Task
}

const plainWord = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

/** Fotos subidas en las actividades (cotizaciones) que aún no se registraron como gasto. */
function activityPhotos(tasks: Task[], budget: BudgetItem[]): ActivityPhoto[] {
  const used = new Set(budget.map((item) => item.option_id).filter(Boolean))
  return tasks.flatMap((task) =>
    (task.options || [])
      .filter((option) => option.image_url.startsWith('data:image/') && !used.has(option.id))
      .sort((a, b) => b.is_winner - a.is_winner || b.vote_count - a.vote_count)
      .map((option) => ({ option, task })),
  )
}

/** Partida del presupuesto que corresponde a una actividad (p. ej. "Chicharrón"). */
function matchPlan(plan: BudgetItem[], ...names: string[]): BudgetItem | null {
  const wanted = names.map(plainWord).filter(Boolean)
  return (
    plan.find((partida) => {
      if (partida.kind !== 'gasto') return false
      const concept = plainWord(partida.concept)
      return wanted.some((name) => concept === name || concept.includes(name) || name.includes(concept))
    }) ?? null
  )
}

/** Tira de fotos de actividades para registrar el gasto con un toque. */
function ActivityPhotoStrip({ photos, onPick, title }: { photos: ActivityPhoto[]; onPick: (photo: ActivityPhoto) => void; title: string }) {
  if (photos.length === 0) return null
  return (
    <div className="activity-photos">
      <p className="activity-photos-title">{title}</p>
      <div className="activity-photos-row">
        {photos.map((photo) => (
          <button key={photo.option.id} type="button" className="activity-photo" onClick={() => onPick(photo)}>
            <img src={photo.option.image_url} alt="" />
            <span className="activity-photo-task">{photo.task.title}</span>
            <span className="activity-photo-meta">
              {photo.option.price > 0 ? money(photo.option.price) : 'sin precio'}
              {photo.option.is_winner ? ' · elegida' : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Lo ejecutado (cobrado o pagado) que corresponde a una partida del presupuesto inicial. */
function executedFor(real: BudgetItem[], planId: number) {
  return real.filter((item) => item.plan_id === planId && item.status === 'hecho').reduce((acc, item) => acc + item.amount, 0)
}

/** Partidas del presupuesto inicial: presupuestado, ejecutado y diferencia. */
function PlanTable({
  title,
  kind,
  members,
  plan,
  real,
  onAdd,
  onEdit,
  onRemove,
  onRegister,
  onOpenUnplanned,
}: {
  title: string
  kind: BudgetKind
  members: Member[]
  plan: BudgetItem[]
  real: BudgetItem[]
  onAdd: () => void
  onEdit: (item: BudgetItem) => void
  onRemove: (item: BudgetItem) => void
  onRegister?: (item: BudgetItem) => void
  onOpenUnplanned?: () => void
}) {
  const items = plan.filter((item) => item.kind === kind)
  const cuotasCobradas = real
    .filter((item) => isCuota(item) && item.status === 'hecho')
    .reduce((acc, item) => acc + item.amount, 0)
  const rows = [
    ...(kind === 'ingreso'
      ? [{ key: 'cuotas', concept: 'Cuotas del equipo', note: `${members.length} × ${money(CUOTA)}`, owner: '', planned: CUOTA * members.length, executed: cuotasCobradas, item: null as BudgetItem | null }]
      : []),
    ...items.map((item) => ({
      key: String(item.id),
      concept: item.concept,
      note: item.note,
      owner: item.owner_name || '',
      planned: item.amount,
      executed: executedFor(real, item.id),
      item: item as BudgetItem | null,
    })),
  ]
  const totalPlanned = rows.reduce((acc, row) => acc + row.planned, 0)
  const totalExecuted = rows.reduce((acc, row) => acc + row.executed, 0)
  const unplanned = real
    .filter((item) => item.kind === kind && item.status === 'hecho' && !item.plan_id && !isCuota(item))
    .reduce((acc, item) => acc + item.amount, 0)

  return (
    <section className="card plan-card" aria-label={title}>
      <header className="card-head">
        <h2>{title}</h2>
        <Button variant="ghost" size="sm" icon="plus" onClick={onAdd}>
          Agregar partida
        </Button>
      </header>
      <div className="table-scroll">
        <table className="data-table plan-table">
          <thead>
            <tr>
              <th>Partida</th>
              <th className="right">Presupuestado</th>
              <th className="right">{kind === 'ingreso' ? 'Cobrado' : 'Pagado'}</th>
              <th className="right">{kind === 'ingreso' ? 'Falta cobrar' : 'Disponible'}</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const diff = row.planned - row.executed
              const over = kind === 'gasto' && diff < 0
              return (
                <tr key={row.key}>
                  <td>
                    <span className="cell-title">{row.concept}</span>
                    <span className="cell-note">
                      {row.owner}
                      {row.owner && row.note ? ' · ' : ''}
                      {row.note}
                    </span>
                  </td>
                  <td className="right amount" data-label="Presupuestado">{money(row.planned)}</td>
                  <td
                    className={`right amount ${row.executed > 0 ? (kind === 'ingreso' ? 'positive' : '') : 'muted'}`}
                    data-label={kind === 'ingreso' ? 'Cobrado' : 'Pagado'}
                  >
                    {money(row.executed)}
                  </td>
                  <td
                    className={`right amount ${over ? 'danger-text' : diff === 0 ? 'positive' : ''}`}
                    data-label={kind === 'ingreso' ? 'Falta cobrar' : 'Disponible'}
                  >
                    {over ? `Excedido ${money(-diff)}` : diff === 0 ? 'Completo' : money(diff)}
                  </td>
                  <td className="actions-cell">
                    {row.item && onRegister ? (
                      <Button size="sm" variant="soft" icon="camera" onClick={() => onRegister(row.item!)}>
                        Registrar gasto
                      </Button>
                    ) : null}
                    {row.item ? (
                      <>
                        <IconButton icon="pencil" label="Editar partida" onClick={() => onEdit(row.item!)} />
                        <IconButton icon="trash" label="Eliminar partida" onClick={() => onRemove(row.item!)} />
                      </>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="right amount" data-label="Presupuestado">{money(totalPlanned)}</td>
              <td className="right amount" data-label={kind === 'ingreso' ? 'Cobrado' : 'Pagado'}>{money(totalExecuted)}</td>
              <td
                className={`right amount ${kind === 'gasto' && totalPlanned - totalExecuted < 0 ? 'danger-text' : ''}`}
                data-label={kind === 'ingreso' ? 'Falta cobrar' : 'Disponible'}
              >
                {money(totalPlanned - totalExecuted)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {unplanned > 0 ? (
        <p className="plan-unplanned">
          Además hay {money(unplanned)} {kind === 'ingreso' ? 'cobrados' : 'pagados'} que no están asignados a una partida.
          {onOpenUnplanned ? (
            <button type="button" className="link-btn" onClick={onOpenUnplanned}>
              Verlos en Presupuesto en ejecución
            </button>
          ) : null}
        </p>
      ) : null}
    </section>
  )
}


function TreasurerManager({
  settings,
  members,
  currentTreasurer,
}: {
  settings: Member | null | unknown
  members: Member[]
  currentTreasurer: Member | null
}) {
  const { actor, mutate, toast } = useStore()
  const [selectedId, setSelectedId] = useState<string>(currentTreasurer ? String(currentTreasurer.id) : '')
  const [phone, setPhone] = useState<string>(currentTreasurer?.phone ?? '')
  const [saving, setSaving] = useState(false)

  const handleSelect = (idStr: string) => {
    setSelectedId(idStr)
    const m = members.find((item) => item.id === Number(idStr))
    if (m) setPhone(m.phone || '')
  }

  const selectedMember = members.find((item) => item.id === Number(selectedId)) || currentTreasurer

  const saveTreasurer = async () => {
    if (!selectedId) return
    setSaving(true)
    const nextMember = members.find((item) => item.id === Number(selectedId))
    const who = nextMember ? nextMember.name : 'Integrante'

    try {
      await api.updateSettings({ treasurer_id: Number(selectedId) })

      if (nextMember && phone.trim() && phone.trim() !== nextMember.phone) {
        await api.updateMember(nextMember.id, { phone: phone.trim() })
      }

      await api.logActivity({
        entity: 'treasurer',
        action: 'designar',
        detail: `${actor?.name || 'Alguien'} designó a ${who} como Tesorero(a) oficial del desayuno`,
      })

      await mutate(async () => {}, `¡${who} es ahora el Tesorero oficial del desayuno!`)
      toast(`Designado(a) correctamente: ${who} recibirá los pagos de Yape y Plin`, 'win')
    } catch {
      toast('No se pudo guardar la designación del tesorero', 'error')
    } finally {
      setSaving(false)
    }
  }

  const copyTest = async () => {
    if (!phone) return
    try {
      await navigator.clipboard.writeText(phone.replace(/\s/g, ''))
      toast(`Copiado: ${phone} (${selectedMember?.name || 'Tesorero'})`, 'ok')
    } catch {
      toast(`Número: ${phone}`, 'ok')
    }
  }

  return (
    <div className="stack">
      <section className="board" aria-label="Elección de Tesorero">
        <header className="board-head">
          <div>
            <span className="runway-tag">
              <Icon name="wallet" size={13} /> COBRANZA Y RECAUDACIÓN
            </span>
            <h2 className="board-title">Designación de Tesorero(a)</h2>
            <p className="board-sub">
              Elige al integrante del equipo que recibirá las cuotas de S/ 100 por Yape o Plin de los 16 integrantes. Su nombre y número figurarán en los códigos QR y en los reportes de WhatsApp.
            </p>
          </div>
          {currentTreasurer ? (
            <div className="countdown" aria-label="Tesorero actual">
              <span className="small muted">Tesorero activo:</span>
              <strong style={{ fontSize: '20px' }}>{currentTreasurer.name.split(' ')[0]}</strong>
            </div>
          ) : null}
        </header>

        <div className="treasurer-layout">
          <div className="card treasurer-form-card">
            <h3 className="section-title">Elegir quién es el Tesorero(a)</h3>
            <p className="small muted">Puedes designar a cualquier integrante del equipo o cambiarlo en cualquier momento.</p>

            <div className="form-grid" style={{ marginTop: '14px' }}>
              <Field label="Selecciona al integrante">
                <Select value={selectedId} onChange={(e) => handleSelect(e.target.value)}>
                  <option value="">Seleccionar del equipo</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.role || m.area}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Número de celular para Yape / Plin">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ej. 998 112 233"
                  maxLength={20}
                />
              </Field>

              <Button
                onClick={() => void saveTreasurer()}
                disabled={saving || !selectedId}
                icon="check"
              >
                {saving ? 'Guardando…' : 'Guardar y designar como Tesorero'}
              </Button>
            </div>
          </div>

          <div className="card treasurer-preview-card">
            <div className="preview-badge">VISTA PREVIA DEL COMPAÑERO</div>
            <div className="yape-badges" style={{ marginTop: '8px' }}>
              <span className="yape-pill yape">Yape</span>
              <span className="yape-pill plin">Plin</span>
              <span className="yape-interop">Interoperable</span>
            </div>

            <p className="yape-amount">S/ 100.00</p>
            <p className="yape-titular">
              <strong>{selectedMember?.name || 'Tesorero por designar'}</strong>
              <span className="muted small"> · {selectedMember?.role || 'Tesorería del Desayuno'}</span>
            </p>

            <div className="yape-phone-row" style={{ margin: '14px 0' }}>
              <div className="yape-phone-info">
                <span className="small muted">Número de Yape / Plin</span>
                <strong>{phone || 'Sin celular registrado'}</strong>
              </div>
              <Button variant="outline" size="sm" icon="clipboard" onClick={() => void copyTest()} disabled={!phone}>
                Copiar
              </Button>
            </div>

            <p className="tiny muted">
              Al tocar “Pagar con Yape”, todos los compañeros verán estos datos y podrán reportar su pago a este número.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

/** Ingresos: quién pagó, cuánto y su constancia. */
function IncomeTable({
  rows,
  onOpen,
  onEdit,
  onRemove,
}: {
  rows: BudgetItem[]
  onOpen: (item: BudgetItem) => void
  onEdit: (item: BudgetItem) => void
  onRemove: (item: BudgetItem) => void
}) {
  const total = rows.reduce((acc, item) => acc + item.amount, 0)
  return (
    <div className="card table-card">
      <table className="data-table income-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th className="right">Monto</th>
            <th>Constancia</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id} className={item.status === 'hecho' ? '' : 'is-pending'}>
              <td>
                <span className="cell-title">{item.owner_name || item.concept}</span>
                <span className="cell-note">
                  {item.owner_name && !isCuota(item) ? `${item.concept} · ` : ''}
                  {item.due_date ? formatDate(item.due_date) : 'Sin fecha'}
                  {item.status === 'hecho' ? '' : ' · por cobrar'}
                </span>
              </td>
              <td className="right amount positive">{money(item.amount)}</td>
              <td>
                {item.has_receipt ? (
                  <span className="receipt-cell">
                    <button type="button" className="link-btn" onClick={() => onOpen(item)}>
                      <Icon name="camera" size={14} /> Ver foto
                    </button>
                    <ValidateButton item={item} />
                  </span>
                ) : (
                  <span className="muted small">Sin foto</span>
                )}
              </td>
              <td className="actions-cell">
                <IconButton icon="pencil" label="Editar ingreso" onClick={() => onEdit(item)} />
                <IconButton icon="trash" label="Eliminar ingreso" onClick={() => onRemove(item)} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>
              Total · {rows.length} {rows.length === 1 ? 'ingreso' : 'ingresos'}
            </td>
            <td className="right amount">{money(total)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/** Una imagen llegó por el menú Compartir: ¿es una cuota o un gasto? */
function SharedChoice({ file, onClose, onCuota, onGasto }: { file: File; onClose: () => void; onCuota: () => void; onGasto: () => void }) {
  const [preview] = useState(() => URL.createObjectURL(file))
  useEffect(() => () => URL.revokeObjectURL(preview), [preview])
  return (
    <Modal open onClose={onClose} title="Recibimos tu constancia" description="¿Qué quieres registrar con esta imagen?">
      <div className="share-choice">
        <img src={preview} alt="Imagen compartida" />
        <Button icon="download" onClick={onCuota}>
          Es el pago de una cuota
        </Button>
        <Button variant="soft" icon="upload" onClick={onGasto}>
          Es un gasto (boleta o pago)
        </Button>
      </div>
    </Modal>
  )
}

function BudgetEditor({
  item,
  preset,
  initialFile,
  plan,
  onClose,
}: {
  item: BudgetItem | null
  preset?: EditorPreset
  initialFile?: File | null
  plan: BudgetItem[]
  onClose: () => void
}) {
  const stage = item?.stage ?? preset?.stage ?? 'real'
  const isPlan = stage === 'plan'
  const [planId, setPlanId] = useState(String(item?.plan_id ?? preset?.planId ?? ''))
  const { data, mutate } = useStore()
  const [kind, setKind] = useState<BudgetKind>(item?.kind ?? preset?.kind ?? 'gasto')
  const [concept, setConcept] = useState(item?.concept ?? preset?.concept ?? '')
  const [amount, setAmount] = useState(String(item?.amount ?? preset?.amount ?? ''))
  const [status, setStatus] = useState<BudgetStatus>(item?.status ?? preset?.status ?? 'pendiente')
  const [ownerId, setOwnerId] = useState(String(item?.owner_id ?? preset?.ownerId ?? ''))
  const [dueDate, setDueDate] = useState(item?.due_date ?? '')
  const [note, setNote] = useState(item?.note ?? '')
  const [receiptUrl, setReceiptUrl] = useState(item?.receipt_url ?? '')
  // La foto guardada no viene en el refresco: se pide al abrir. Solo se envía si cambió.
  const [receiptChanged, setReceiptChanged] = useState(false)
  const [markedCuota, setMarkedCuota] = useState(item?.category === 'cuota')
  const [optionId, setOptionId] = useState<number | null>(item?.option_id ?? null)
  const photos = data && !item && !isPlan && kind === 'gasto' ? activityPhotos(data.tasks, data.budget) : []

  /** Toma la foto de una actividad como constancia y completa el gasto. */
  const applyPhoto = async ({ option, task }: ActivityPhoto) => {
    setOptionId(option.id)
    setReceiptUrl(option.image_url)
    setReceiptChanged(true)
    const title = option.title.trim()
    setConcept(!title || plainWord(title).includes(plainWord(task.title)) ? title || task.title : `${task.title}: ${title}`)
    if (option.created_by) setOwnerId(String(option.created_by))
    setStatus('hecho')
    const partida = matchPlan(plan, task.title, option.title)
    if (partida) setPlanId(String(partida.id))
    setScrapedInfo(null)
    if (option.price > 0) {
      setAmount(String(option.price))
      return
    }
    // Sin precio en la actividad: se lee de la foto.
    setScanning(true)
    try {
      const scraped = await api.scrapeQuoteImage(option.image_url)
      if (scraped.ok && scraped.detectedAmount) {
        setAmount(String(scraped.detectedAmount))
        setScrapedInfo({ amount: scraped.detectedAmount, concept: scraped.detectedConcept, allPrices: scraped.allPrices || [] })
      }
    } finally {
      setScanning(false)
    }
  }
  const [compressing, setCompressing] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scrapedInfo, setScrapedInfo] = useState<{ amount: number | null; concept: string; allPrices: number[] } | null>(null)
  const [saving, setSaving] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!item?.has_receipt || item.receipt_url) return
    let alive = true
    void api.getReceipt(item.id).then((res) => alive && setReceiptUrl(res.receipt_url)).catch(() => {})
    return () => {
      alive = false
    }
  }, [item])

  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const fromOption = preset?.optionId && data ? activityPhotos(data.tasks, data.budget).find((p) => p.option.id === preset.optionId) : null
    if (fromOption) void applyPhoto(fromOption)
    else if (initialFile) void processFile(initialFile)
    else if (preset?.pick) fileInputRef.current?.click()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleReceiptSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await processFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const processFile = async (file: File) => {
    try {
      setCompressing(true)
      const compressed = await compressImageFile(file, 1100, 0.78)
      setReceiptUrl(compressed)
      setReceiptChanged(true)
      setCompressing(false)

      setScanning(true)
      try {
        const scraped = await scanVoucher(file, compressed)
        if (scraped.ok) {
          if (scraped.detectedAmount) {
            setAmount(String(scraped.detectedAmount))
          }
          if (scraped.detectedConcept && !concept.trim()) {
            setConcept(scraped.detectedConcept)
          }
          // Constancia de Yape/Plin/banco en un ingreso: es una cuota ya cobrada.
          if (scraped.wallet && kind === 'ingreso' && data) {
            const payer = data.members.find((m) => m.id === Number(ownerId)) ??
              findPayer(scraped.rawText || '', data.members, data.settings.treasurer_id ?? null)
            if (payer && !ownerId) setOwnerId(String(payer.id))
            if (!concept.trim()) setConcept(payer ? `Cuota de ${payer.name}` : `Pago por ${scraped.wallet}`)
            setStatus('hecho')
            setMarkedCuota(true)
          } else if (scraped.wallet && kind === 'gasto' && !concept.trim()) {
            setConcept(`Pago por ${scraped.wallet}`)
          }
          if (scraped.paidAt && !dueDate) setDueDate(scraped.paidAt)
          if ((scraped.wallet || scraped.operationCode) && !note.trim()) {
            setNote([scraped.wallet, scraped.operationCode ? `Op. ${scraped.operationCode}` : ''].filter(Boolean).join(' · '))
          }
          setScrapedInfo({
            amount: scraped.detectedAmount,
            concept: scraped.detectedConcept,
            allPrices: scraped.allPrices || [],
          })
        }
      } catch (ocrErr) {
        console.warn('OCR error in budget editor:', ocrErr)
      } finally {
        setScanning(false)
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al procesar la foto')
      setCompressing(false)
    }
  }

  const save = async () => {
    if (!concept.trim()) return
    setSaving(true)
    const payload = {
      kind,
      concept: concept.trim(),
      amount: Number(amount) || 0,
      status,
      owner_id: ownerId ? Number(ownerId) : null,
      due_date: dueDate || null,
      note,
      ...(receiptChanged || !item ? { receipt_url: receiptUrl } : {}),
      // Un ingreso cuyo concepto dice "cuota" cuenta como cuota en "¿Quién ya pagó?".
      ...(kind === 'ingreso' && (markedCuota || /\bcuota/i.test(concept)) ? { category: 'cuota' } : kind === 'gasto' ? { category: '' } : {}),
      stage,
      ...(isPlan ? { status: 'pendiente' } : { plan_id: planId ? Number(planId) : null }),
      ...(optionId && !item ? { option_id: optionId } : {}),
    }
    const ok = await mutate(
      () => (item ? api.updateBudget(item.id, payload) : api.createBudget(payload)),
      item ? 'Movimiento actualizado' : 'Movimiento agregado',
    )
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isPlan ? (item ? 'Editar partida' : 'Nueva partida') : item ? 'Editar movimiento' : kind === 'gasto' ? 'Registrar gasto' : 'Registrar ingreso'}
      description={
        isPlan
          ? 'Partida del presupuesto inicial: lo que se planea cobrar o gastar.'
          : 'Ingreso o gasto real. Sube la foto de la boleta o constancia y se lee el monto.'
      }
      footer={
        <>
          <span className="spacer" />
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={saving || !concept.trim()}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        {/* Subida y escaneo de foto de cotización / boleta */}
        {receiptUrl ? null : (
          <ActivityPhotoStrip photos={photos} title="¿Ya hay una foto en las actividades? Úsala:" onPick={(photo) => void applyPhoto(photo)} />
        )}
        <div className="budget-photo-section">
          {receiptUrl ? (
            <div className="budget-receipt-preview">
              <img src={receiptUrl} alt="Boleta / Cotización" className="budget-receipt-img" />
              <div className="budget-receipt-tools">
                <Button size="sm" variant="outline" type="button" onClick={() => fileInputRef.current?.click()} disabled={compressing || scanning}>
                  Cambiar imagen
                </Button>
                <Button size="sm" variant="danger" type="button" onClick={() => { setReceiptUrl(''); setReceiptChanged(true); setScrapedInfo(null) }}>
                  Quitar imagen
                </Button>
              </div>
            </div>
          ) : (
            <div className="budget-receipt-dropzone" onClick={() => !compressing && fileInputRef.current?.click()}>
              <Icon name="camera" size={24} />
              <div>
                <strong>{compressing ? 'Procesando imagen…' : 'Subir foto de cotización o boleta'}</strong>
                <p className="tiny muted">
                  {compressing ? 'Espera un momento…' : 'Escanea automáticamente el precio y concepto de la imagen con IA'}
                </p>
              </div>
            </div>
          )}

          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleReceiptSelect}
          />

          {scanning ? (
            <div className="ocr-scanning-pill">
              <span className="live-ping-dot" />
              <span>🔍 Leyendo cotización con IA (extrayendo monto)…</span>
            </div>
          ) : scrapedInfo?.amount ? (
            <div className="ocr-detected-box">
              <div className="ocr-detected-head">
                <span className="ocr-sparkle">✨</span>
                <strong>Monto detectado: S/ {scrapedInfo.amount.toFixed(2)}</strong>
              </div>
              <p className="tiny muted">
                Se completó automáticamente en el campo de monto. Puedes editarlo o digitar otro valor si deseas.
              </p>
              {scrapedInfo.allPrices.length > 1 ? (
                <div className="ocr-alt-row">
                  <span className="tiny muted">Otros montos encontrados:</span>
                  {scrapedInfo.allPrices.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`ocr-chip-btn ${amount === String(p) ? 'is-selected' : ''}`}
                      onClick={() => setAmount(String(p))}
                    >
                      S/ {p.toFixed(2)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="form-row">
          <Field label="Tipo">
            <Select value={kind} onChange={(event) => setKind(event.target.value as BudgetKind)}>
              <option value="ingreso">Ingreso</option>
              <option value="gasto">Gasto</option>
            </Select>
          </Field>
          <Field label="Monto (S/) — puedes digitarlo o editarlo">
            <Input type="number" min="0" step="0.5" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
          </Field>
        </div>
        <Field label="Concepto">
          <Input value={concept} onChange={(event) => setConcept(event.target.value)} placeholder="Ej. Insumos del desayuno o proveedor" autoFocus />
        </Field>
        <div className="form-row">
          <Field label={kind === 'ingreso' ? 'Quién pagó' : 'Responsable'}>
            <Select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
              <option value="">Sin responsable</option>
              {data?.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha">
            <Input type="date" value={dueDate ?? ''} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
          {isPlan ? null : (
            <Field label="Estado">
              <Select value={status} onChange={(event) => setStatus(event.target.value as BudgetStatus)}>
                <option value="pendiente">Pendiente</option>
                <option value="hecho">{kind === 'ingreso' ? 'Cobrado' : 'Pagado'}</option>
              </Select>
            </Field>
          )}
        </div>
        {isPlan ? null : (
          <Field label="Partida del presupuesto" hint="Así se descuenta de lo presupuestado">
            <Select value={planId} onChange={(event) => setPlanId(event.target.value)}>
              <option value="">Fuera del presupuesto</option>
              {plan
                .filter((partida) => partida.kind === kind)
                .map((partida) => (
                  <option key={partida.id} value={partida.id}>
                    {partida.concept} · {money(partida.amount)}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        <Field label="Nota">
          <TextArea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Detalle opcional" />
        </Field>
      </div>
    </Modal>
  )
}

