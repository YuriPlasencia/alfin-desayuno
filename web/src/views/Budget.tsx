import { useMemo, useState } from 'react'
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
  Modal,
  PageHeader,
  Progress,
  Select,
  TextArea,
} from '../components/ui'
import { summarize } from '../lib/stats'
import { formatDate, money } from '../lib/format'
import type { BudgetItem, BudgetKind, BudgetStatus } from '../types'

export function Budget() {
  const { data, mutate } = useStore()
  const [filter, setFilter] = useState<'todos' | BudgetKind>('todos')
  const [editing, setEditing] = useState<BudgetItem | 'nuevo' | null>(null)
  const summary = useMemo(() => (data ? summarize(data) : null), [data])

  if (!data || !summary) return null

  const rows = data.budget.filter((item) => (filter === 'todos' ? true : item.kind === filter))
  const ingresos = data.budget.filter((item) => item.kind === 'ingreso')
  const gastos = data.budget.filter((item) => item.kind === 'gasto')

  const toggle = (item: BudgetItem) =>
    mutate(
      () => api.updateBudget(item.id, { status: item.status === 'hecho' ? 'pendiente' : 'hecho' }),
      item.status === 'hecho' ? 'Marcado como pendiente' : item.kind === 'ingreso' ? 'Ingreso cobrado' : 'Gasto pagado',
    )

  const remove = async (item: BudgetItem) => {
    if (!window.confirm(`¿Eliminar “${item.concept}” del presupuesto?`)) return
    await mutate(() => api.deleteBudget(item.id), 'Movimiento eliminado')
  }

  return (
    <div className="stack">
      <PageHeader
        title="Presupuesto"
        subtitle="Aportes del equipo, gastos previstos y saldo disponible"
        action={
          <Button icon="plus" onClick={() => setEditing('nuevo')}>
            Nuevo movimiento
          </Button>
        }
      />

      <section className="board ledger" aria-label="Caja del desayuno">
        <div className="ledger-figures">
          <div className="ledger-figure income">
            <span className="budget-label">
              <Icon name="download" size={16} /> Ingresos previstos
            </span>
            <strong>{money(summary.budget.ingresos)}</strong>
            <span className="small">{money(summary.budget.cobrado)} ya cobrado</span>
          </div>
          <div className="ledger-figure expense">
            <span className="budget-label">
              <Icon name="upload" size={16} /> Gastos planificados
            </span>
            <strong>{money(summary.budget.gastos)}</strong>
            <span className="small">{money(summary.budget.pagado)} ya pagado</span>
          </div>
          <div className={`ledger-figure balance ${summary.budget.saldo < 0 ? 'is-negative' : ''}`}>
            <span className="budget-label">
              <Icon name="wallet" size={16} /> Saldo
            </span>
            <strong className={summary.budget.saldo < 0 ? 'danger-text' : ''}>{money(summary.budget.saldo)}</strong>
            <span className="small">{summary.budget.saldo >= 0 ? 'dentro de lo previsto' : 'revisar gastos'}</span>
          </div>
        </div>
        <div className="ledger-meter">
          <div className="team-meter-row">
            <p>
              <strong>{Math.round(summary.budget.avanceCobro * 100)}%</strong> cobrado · {money(summary.budget.cobrado)} de{' '}
              {money(summary.budget.ingresos)}
            </p>
            {summary.budget.avanceCobro === 1 ? <Badge tone="success">Meta completa</Badge> : null}
          </div>
          <Progress value={summary.budget.avanceCobro} tone={summary.budget.avanceCobro === 1 ? 'success' : 'brand'} />
        </div>
      </section>

      <div className="segmented">
        <button className={filter === 'todos' ? 'is-active' : ''} onClick={() => setFilter('todos')}>
          Todos <span className="seg-count">{data.budget.length}</span>
        </button>
        <button className={filter === 'ingreso' ? 'is-active' : ''} onClick={() => setFilter('ingreso')}>
          Ingresos <span className="seg-count">{ingresos.length}</span>
        </button>
        <button className={filter === 'gasto' ? 'is-active' : ''} onClick={() => setFilter('gasto')}>
          Gastos <span className="seg-count">{gastos.length}</span>
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="wallet" title="Sin movimientos" hint="Agrega los aportes y los gastos previstos del desayuno." />
      ) : (
        <div className="card table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Concepto</th>
                <th>Tipo</th>
                <th>Responsable</th>
                <th>Fecha</th>
                <th className="right">Monto</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id} className={item.status === 'hecho' ? 'is-done' : ''}>
                  <td>
                    <span className="cell-title">{item.concept}</span>
                    {item.note ? <span className="cell-note">{item.note}</span> : null}
                  </td>
                  <td>
                    <Badge tone={item.kind === 'ingreso' ? 'success' : 'neutral'}>
                      {item.kind === 'ingreso' ? 'Ingreso' : 'Gasto'}
                    </Badge>
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
                    <IconButton icon="pencil" label="Editar movimiento" onClick={() => setEditing(item)} />
                    <IconButton icon="trash" label="Eliminar movimiento" onClick={() => void remove(item)} />
                  </td>
                </tr>
              ))}
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

      <p className="muted tiny">
        Los montos están en soles (S/). El saldo se calcula con todos los ingresos y gastos, estén pagados o no.
      </p>

      {editing ? <BudgetEditor item={editing === 'nuevo' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  )
}

function BudgetEditor({ item, onClose }: { item: BudgetItem | null; onClose: () => void }) {
  const { data, mutate } = useStore()
  const [kind, setKind] = useState<BudgetKind>(item?.kind ?? 'gasto')
  const [concept, setConcept] = useState(item?.concept ?? '')
  const [amount, setAmount] = useState(String(item?.amount ?? ''))
  const [status, setStatus] = useState<BudgetStatus>(item?.status ?? 'pendiente')
  const [ownerId, setOwnerId] = useState(String(item?.owner_id ?? ''))
  const [dueDate, setDueDate] = useState(item?.due_date ?? '')
  const [note, setNote] = useState(item?.note ?? '')
  const [saving, setSaving] = useState(false)

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
      title={item ? 'Editar movimiento' : 'Nuevo movimiento'}
      description="Registra aportes, apoyo de la empresa o gastos del desayuno."
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
        <div className="form-row">
          <Field label="Tipo">
            <Select value={kind} onChange={(event) => setKind(event.target.value as BudgetKind)}>
              <option value="ingreso">Ingreso</option>
              <option value="gasto">Gasto</option>
            </Select>
          </Field>
          <Field label="Monto (S/)">
            <Input type="number" min="0" step="10" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" />
          </Field>
        </div>
        <Field label="Concepto">
          <Input value={concept} onChange={(event) => setConcept(event.target.value)} placeholder="Ej. Insumos del desayuno" autoFocus />
        </Field>
        <div className="form-row">
          <Field label="Responsable">
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
          <Field label="Estado">
            <Select value={status} onChange={(event) => setStatus(event.target.value as BudgetStatus)}>
              <option value="pendiente">Pendiente</option>
              <option value="hecho">{kind === 'ingreso' ? 'Cobrado' : 'Pagado'}</option>
            </Select>
          </Field>
        </div>
        <Field label="Nota">
          <TextArea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Detalle opcional" />
        </Field>
      </div>
    </Modal>
  )
}
