import { useMemo, useRef, useState } from 'react'
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
import { summarize } from '../lib/stats'
import { formatDate, getTreasurer, money } from '../lib/format'
import type { BudgetItem, BudgetKind, BudgetStatus, Member, TaskOption } from '../types'

export function Budget() {
  const { data, actor, mutate, toast } = useStore()
  const [mainTab, setMainTab] = useState<'movimientos' | 'tesorero'>('movimientos')
  const [filter, setFilter] = useState<'todos' | BudgetKind>('todos')
  const [editing, setEditing] = useState<BudgetItem | 'nuevo' | null>(null)
  const [showYape, setShowYape] = useState(false)
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null)
  const summary = useMemo(() => (data ? summarize(data) : null), [data])

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

  const copyWhatsAppReport = async () => {
    const tName = treasurer ? treasurer.name : 'Tesorería'
    const tPhone = treasurer?.phone ? ` · *${treasurer.phone}*` : ''

    const text = `🥐 *AL FIN DESAYUNO · REPORTE DE CAJA*
📅 *Evento:* ${data.settings.event_name}
📍 *Lugar:* ${data.settings.location || 'Por definir'}
------------------------------------
💰 *Saldo en caja:* ${money(summary.budget.saldo)}
📥 *Ingresos cobrados:* ${money(summary.budget.cobrado)} de ${money(summary.budget.ingresos)} (${Math.round(summary.budget.avanceCobro * 100)}%)
📤 *Gastos pagados:* ${money(summary.budget.pagado)} de ${money(summary.budget.gastos)}

📲 *Para cuotas individuales (S/ 100.00):*
Yape / Plin a: ${tName}${tPhone}
(Al yapear, envía tu constancia o regístrala en la app)`

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
        subtitle="Aportes del equipo, cobranza por Yape/Plin y saldo disponible"
        action={
          <div className="btn-group">
            <Button variant="soft" icon="share" onClick={() => void copyWhatsAppReport()}>
              WhatsApp
            </Button>
            <Button variant="soft" icon="qrCode" onClick={() => setShowYape(true)}>
              Pagar con Yape
            </Button>
            {mainTab === 'movimientos' ? (
              <Button icon="plus" onClick={() => setEditing('nuevo')}>
                Nuevo movimiento
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="segmented">
        <button className={mainTab === 'movimientos' ? 'is-active' : ''} onClick={() => setMainTab('movimientos')}>
          Movimientos y Caja <span className="seg-count">{data.budget.length}</span>
        </button>
        <button className={mainTab === 'tesorero' ? 'is-active' : ''} onClick={() => setMainTab('tesorero')}>
          Elección de Tesorero(a) <span className="seg-count">{treasurer ? '✓' : '—'}</span>
        </button>
      </div>

      {mainTab === 'tesorero' ? (
        <TreasurerManager
          settings={data.settings}
          members={data.members}
          currentTreasurer={treasurer}
        />
      ) : (
        <>
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

      {winningOptions.length > 0 ? (
        <div className="budget-quote-import-banner">
          <div className="quote-import-info">
            <span className="quote-import-icon">🏆</span>
            <div>
              <strong>Hay {winningOptions.length} cotización(es) ganadora(s) de actividades lista(s) para registrar en presupuesto</strong>
              <p className="tiny muted">
                {winningOptions.map((w) => `${w.option.title} (${money(w.option.price)})`).join(' · ')}
              </p>
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
                  concept: `${item.option.title} (${item.taskTitle})`,
                  amount: item.option.price,
                  status: 'pendiente',
                  note: `Cotización ganadora de actividad: ${item.taskTitle}`,
                  receipt_url: item.option.image_url || '',
                })
              }
              await mutate(async () => {}, 'Cotizaciones agregadas al presupuesto')
              toast('¡Cotizaciones pasadas a gastos del presupuesto!', 'ok')
            }}
          >
            Pasar a gastos
          </Button>
        </div>
      ) : null}

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
                    <div className="cell-concept-row">
                      <span className="cell-title">{item.concept}</span>
                      {item.receipt_url ? (
                        <button
                          type="button"
                          className="receipt-chip-btn"
                          onClick={() => setViewingReceipt(item.receipt_url!)}
                          title="Ver imagen de la boleta o cotización"
                        >
                          <Icon name="camera" size={12} />
                          <span>Ver boleta</span>
                        </button>
                      ) : null}
                    </div>
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
        </>
      )}

      {editing ? <BudgetEditor item={editing === 'nuevo' ? null : editing} onClose={() => setEditing(null)} /> : null}
      {showYape && data ? (
        <YapeModal
          members={data.members}
          currentActorId={actor?.id ?? null}
          treasurer={treasurer}
          onClose={() => setShowYape(false)}
        />
      ) : null}

      {viewingReceipt ? (
        <div className="photo-lightbox" onClick={() => setViewingReceipt(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={viewingReceipt} alt="Comprobante o Cotización" className="lightbox-img" />
            <button
              type="button"
              className="lightbox-close"
              onClick={() => setViewingReceipt(null)}
              aria-label="Cerrar imagen"
            >
              <Icon name="x" size={24} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
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

function YapeModal({
  onClose,
  members,
  currentActorId,
  treasurer,
}: {
  onClose: () => void
  members: Member[]
  currentActorId: number | null
  treasurer: Member | null
}) {
  const { toast } = useStore()
  const [payerId, setPayerId] = useState<string>(currentActorId ? String(currentActorId) : '')
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)

  const treasurerName = treasurer?.name || 'Tesorería Alfin'
  const treasurerPhone = treasurer?.phone || '998 112 233'
  const cleanPhone = treasurerPhone.replace(/\s/g, '')

  const copyPhone = async () => {
    try {
      await navigator.clipboard.writeText(cleanPhone)
      toast(`Número copiado: ${treasurerPhone} (${treasurerName})`, 'ok')
    } catch {
      toast(`Copia manual: ${treasurerPhone}`, 'ok')
    }
  }

  const submit = async () => {
    const member = members.find((m) => m.id === Number(payerId))
    const who = member ? member.name : 'Alguien'
    const cleanCode = code.trim() || 'Sin código'
    setSaving(true)
    try {
      await api.logActivity({
        entity: 'budget',
        action: 'yape',
        detail: `${who} registró constancia de aporte por Yape/Plin S/ 100.00 a ${treasurerName} (Op: ${cleanCode})`,
      })
      toast(`¡Aporte de S/ 100 registrado para ${who}!`, 'win')
      onClose()
    } catch {
      toast('No se pudo registrar la constancia', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Pagar cuota por Yape / Plin"
      description={`Cuota individual de S/ 100 dirigida a ${treasurerName}`}
      footer={
        <>
          <span className="spacer" />
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={() => void submit()} disabled={saving || !payerId}>
            {saving ? 'Registrando…' : 'Registrar mi aporte'}
          </Button>
        </>
      }
    >
      <div className="yape-card">
        <div className="yape-header">
          <div className="yape-badges">
            <span className="yape-pill yape">Yape</span>
            <span className="yape-pill plin">Plin</span>
            <span className="yape-interop">Interoperable</span>
          </div>
          <p className="yape-amount">S/ 100.00</p>
          <p className="yape-titular">
            <strong>{treasurerName}</strong> · {treasurer?.role || 'Tesorería Alfin'}
          </p>
        </div>

        <div className="yape-qr-box">
          <svg className="yape-qr-svg" viewBox="0 0 120 120" aria-label="Código QR de Yape y Plin">
            <rect width="120" height="120" fill="#ffffff" rx="8" />
            <rect x="10" y="10" width="30" height="30" fill="#742284" rx="4" />
            <rect x="16" y="16" width="18" height="18" fill="#ffffff" rx="2" />
            <rect x="20" y="20" width="10" height="10" fill="#742284" rx="1" />
            <rect x="80" y="10" width="30" height="30" fill="#742284" rx="4" />
            <rect x="86" y="16" width="18" height="18" fill="#ffffff" rx="2" />
            <rect x="90" y="20" width="10" height="10" fill="#742284" rx="1" />
            <rect x="10" y="80" width="30" height="30" fill="#742284" rx="4" />
            <rect x="16" y="86" width="18" height="18" fill="#ffffff" rx="2" />
            <rect x="20" y="90" width="10" height="10" fill="#742284" rx="1" />
            <rect x="48" y="14" width="8" height="8" fill="#00b5e2" rx="1" />
            <rect x="62" y="14" width="8" height="16" fill="#742284" rx="1" />
            <rect x="48" y="30" width="16" height="8" fill="#742284" rx="1" />
            <rect x="48" y="46" width="24" height="24" fill="#00b5e2" rx="2" />
            <rect x="14" y="48" width="24" height="8" fill="#742284" rx="1" />
            <rect x="24" y="62" width="16" height="10" fill="#00b5e2" rx="1" />
            <rect x="80" y="48" width="12" height="14" fill="#742284" rx="1" />
            <rect x="98" y="52" width="12" height="24" fill="#00b5e2" rx="1" />
            <rect x="48" y="78" width="14" height="14" fill="#742284" rx="1" />
            <rect x="70" y="84" width="16" height="8" fill="#00b5e2" rx="1" />
            <rect x="92" y="84" width="18" height="18" fill="#742284" rx="1" />
            <rect x="68" y="98" width="18" height="12" fill="#742284" rx="1" />
          </svg>
          <p className="small muted">Escanea desde tu app bancaria con tu celular</p>
        </div>

        <div className="yape-phone-row">
          <div className="yape-phone-info">
            <span className="small muted">Número de Yape / Plin ({treasurerName.split(' ')[0]})</span>
            <strong>{treasurerPhone}</strong>
          </div>
          <Button variant="outline" size="sm" icon="clipboard" onClick={() => void copyPhone()}>
            Copiar
          </Button>
        </div>

        <div className="yape-confirm-form">
          <Field label="¿Quién eres? (Tu imán en el equipo)">
            <Select value={payerId} onChange={(e) => setPayerId(e.target.value)}>
              <option value="">Selecciona tu nombre</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="N° de constancia u operación (opcional)">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ej. OP-492104"
              maxLength={20}
            />
          </Field>
        </div>
      </div>
    </Modal>
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
  const [receiptUrl, setReceiptUrl] = useState(item?.receipt_url ?? '')
  const [compressing, setCompressing] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scrapedInfo, setScrapedInfo] = useState<{ amount: number | null; concept: string; allPrices: number[] } | null>(null)
  const [saving, setSaving] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleReceiptSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setCompressing(true)
      const compressed = await compressImageFile(file, 900, 0.75)
      setReceiptUrl(compressed)
      setCompressing(false)

      setScanning(true)
      try {
        const scraped = await api.scrapeQuoteImage(compressed)
        if (scraped.ok) {
          if (scraped.detectedAmount) {
            setAmount(String(scraped.detectedAmount))
          }
          if (scraped.detectedConcept && !concept.trim()) {
            setConcept(scraped.detectedConcept)
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
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
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
      receipt_url: receiptUrl,
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
      description="Registra aportes, cotizaciones con foto o gastos del desayuno."
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
        <div className="budget-photo-section">
          {receiptUrl ? (
            <div className="budget-receipt-preview">
              <img src={receiptUrl} alt="Boleta / Cotización" className="budget-receipt-img" />
              <div className="budget-receipt-tools">
                <Button size="sm" variant="outline" type="button" onClick={() => fileInputRef.current?.click()} disabled={compressing || scanning}>
                  Cambiar imagen
                </Button>
                <Button size="sm" variant="danger" type="button" onClick={() => { setReceiptUrl(''); setScrapedInfo(null) }}>
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
            capture="environment"
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

