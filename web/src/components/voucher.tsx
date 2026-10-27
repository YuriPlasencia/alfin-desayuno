import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import { compressImageFile } from '../lib/image'
import { formatDate, money } from '../lib/format'
import type { BudgetItem, Member, ScrapedQuote } from '../types'
import { CUOTA, isCuota } from '../lib/stats'
import { Avatar, Badge, Button, Field, Icon, Input, Magnet, Modal, Select } from './ui'

export { CUOTA }

const today = () => new Date().toISOString().slice(0, 10)

const plainText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/**
 * Busca en el texto de la captura el nombre de alguien del equipo.
 * En Yape/Plin suele salir el destinatario (el tesorero), así que se descarta.
 */
export function findPayer(rawText: string, members: Member[], treasurerId: number | null): Member | null {
  const text = plainText(rawText)
  if (!text.trim()) return null
  const found = members
    .map((member) => {
      const [first = '', last = ''] = plainText(member.name).split(/\s+/)
      const hasFirst = first.length > 2 && new RegExp(`\\b${first}\\b`).test(text)
      if (!hasFirst) return null
      const hasLast = last.length > 1 && new RegExp(`\\b${last}\\b`).test(text)
      const hasInitial = last.length > 0 && new RegExp(`\\b${first}\\s+${last[0]}\\b`).test(text)
      const score = hasLast ? 2 : hasInitial ? 1 : 0
      return score > 0 ? { member, score } : null
    })
    .filter((entry): entry is { member: Member; score: number } => Boolean(entry))
    .filter((entry) => entry.member.id !== treasurerId)
    .sort((a, b) => b.score - a.score)
  return found[0]?.member ?? null
}

/**
 * Lee una constancia. Tesseract pierde los números muy grandes (el "S/ 100" de Yape),
 * así que si falta el monto se vuelve a leer una versión reducida y se combinan.
 */
export async function scanVoucher(file: File, compressed: string): Promise<ScrapedQuote> {
  const first = await api.scrapeQuoteImage(compressed)
  if (first.ok && first.detectedAmount) return first
  const small = await compressImageFile(file, 480, 0.85)
  const second = await api.scrapeQuoteImage(small)
  if (!second.ok) return first
  return {
    ...first,
    ok: true,
    detectedAmount: second.detectedAmount ?? first.detectedAmount,
    allPrices: Array.from(new Set([...(first.allPrices || []), ...(second.allPrices || [])])).slice(0, 6),
    wallet: first.wallet || second.wallet,
    operationCode: first.operationCode || second.operationCode,
    paidAt: first.paidAt || second.paidAt,
  }
}

/** Foto de constancia: se comprime en el celular y el servidor lee monto, billetera y n.° de operación. */
export function useVoucher(initial?: File | null) {
  const [image, setImage] = useState('')
  const [busy, setBusy] = useState<'idle' | 'compressing' | 'scanning'>('idle')
  const [scan, setScan] = useState<ScrapedQuote | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pick = async (file: File | undefined | null) => {
    if (!file) return
    setError(null)
    setScan(null)
    try {
      setBusy('compressing')
      // 1100 px mantiene legibles los textos chicos de Yape/Plin y facturas.
      const compressed = await compressImageFile(file, 1100, 0.78)
      setImage(compressed)
      setBusy('scanning')
      const result = await scanVoucher(file, compressed)
      setScan(result.ok ? result : null)
      if (!result.ok) setError('No se pudo leer la imagen; escribe el monto a mano.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo usar esa foto')
    } finally {
      setBusy('idle')
    }
  }

  const started = useRef(false)
  useEffect(() => {
    if (initial && !started.current) {
      started.current = true
      void pick(initial)
    }
  }, [initial])

  return { image, busy, scan, error, pick, clear: () => (setImage(''), setScan(null)) }
}

/** Zona para tomar o elegir la foto, con la vista previa y lo que se leyó. */
export function VoucherDrop({ voucher, label }: { voucher: ReturnType<typeof useVoucher>; label: string }) {
  const input = useRef<HTMLInputElement>(null)
  const { image, busy, scan, error } = voucher
  return (
    <div className="voucher">
      {image ? (
        <div className="voucher-preview">
          <img src={image} alt="Constancia" />
          <Button type="button" size="sm" variant="outline" icon="camera" disabled={busy !== 'idle'} onClick={() => input.current?.click()}>
            Cambiar foto
          </Button>
        </div>
      ) : (
        <button type="button" className="voucher-drop" disabled={busy !== 'idle'} onClick={() => input.current?.click()}>
          <Icon name="camera" size={26} />
          <strong>{busy === 'compressing' ? 'Preparando la foto…' : label}</strong>
          <span className="muted small">Captura de Yape o Plin, constancia del banco o foto de la boleta</span>
        </button>
      )}
      {busy === 'scanning' ? (
        <p className="voucher-status">
          <span className="spinner spinner-sm" /> Leyendo la constancia…
        </p>
      ) : scan?.detectedAmount ? (
        <p className="voucher-status is-ok">
          <Icon name="sparkles" size={15} /> Leímos {money(scan.detectedAmount)}
          {scan.wallet ? ` · ${scan.wallet}` : ''}
          {scan.operationCode ? ` · Op. ${scan.operationCode}` : ''}. Revisa que esté bien.
        </p>
      ) : scan ? (
        <p className="voucher-status">No pudimos leer el monto en la foto: escríbelo abajo.</p>
      ) : null}
      {error ? <p className="field-error">{error}</p> : null}
      <input ref={input} type="file" accept="image/*" hidden onChange={(event) => {
        void voucher.pick(event.target.files?.[0])
        event.target.value = ''
      }} />
    </div>
  )
}

/** Registrar la cuota propia (o de otro) con su constancia; suma de inmediato a lo recaudado. */
export function CuotaModal({
  members,
  budget,
  treasurer,
  initialFile,
  onClose,
}: {
  members: Member[]
  budget: BudgetItem[]
  treasurer: Member | null
  initialFile?: File | null
  onClose: () => void
}) {
  const { actor, mutate, toast } = useStore()
  const voucher = useVoucher(initialFile)
  const [payerId, setPayerId] = useState(actor ? String(actor.id) : '')
  const [recognized, setRecognized] = useState<'si' | 'no' | null>(null)
  const payerTouched = useRef(false)
  const [amount, setAmount] = useState(String(CUOTA))
  const [operation, setOperation] = useState('')
  const [saving, setSaving] = useState(false)
  const touched = useRef(false)

  useEffect(() => {
    if (!voucher.scan) return
    if (voucher.scan.detectedAmount && !touched.current) setAmount(String(voucher.scan.detectedAmount))
    if (voucher.scan.operationCode) setOperation((current) => current || voucher.scan!.operationCode!)
    const match = findPayer(voucher.scan.rawText || '', members, treasurer?.id ?? null)
    setRecognized(match ? 'si' : 'no')
    if (match && !payerTouched.current) setPayerId(String(match.id))
  }, [voucher.scan, members, treasurer])

  const payer = members.find((member) => member.id === Number(payerId))
  const previous = budget.filter((item) => isCuota(item) && item.owner_id === Number(payerId))
  const phone = treasurer?.phone || ''

  const copyPhone = async () => {
    try {
      await navigator.clipboard.writeText(phone.replace(/\s/g, ''))
      toast(`Número copiado: ${phone}`)
    } catch {
      toast(`Número: ${phone}`)
    }
  }

  const submit = async () => {
    if (!payer || !voucher.image) return
    setSaving(true)
    const wallet = voucher.scan?.wallet || 'Yape/Plin'
    const ok = await mutate(() =>
      api.createBudget({
        kind: 'ingreso',
        category: 'cuota',
        concept: `Cuota de ${payer.name}`,
        amount: Number(amount) || 0,
        status: 'hecho',
        owner_id: payer.id,
        due_date: voucher.scan?.paidAt || today(),
        note: [wallet, operation ? `Op. ${operation}` : ''].filter(Boolean).join(' · '),
        receipt_url: voucher.image,
      }),
    )
    setSaving(false)
    if (ok) {
      toast(`¡Cuota de ${payer.name.split(' ')[0]} registrada! Ya suma a lo recaudado.`, 'win')
      onClose()
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Subir constancia de cuota"
      description={`Cuota de ${money(CUOTA)} por persona${treasurer ? ` · se paga a ${treasurer.name}` : ''}`}
      footer={
        <>
          <span className="spacer" />
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={saving || !payer || !voucher.image || voucher.busy !== 'idle' || !(Number(amount) > 0)}>
            {saving ? 'Registrando…' : 'Registrar cuota'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        {treasurer && phone ? (
          <div className="pay-to">
            <div>
              <span className="muted small">Yape o Plin a {treasurer.name}</span>
              <strong>{phone}</strong>
            </div>
            <Button variant="outline" size="sm" icon="clipboard" onClick={() => void copyPhone()}>
              Copiar
            </Button>
          </div>
        ) : null}
        <VoucherDrop voucher={voucher} label="Sube la captura de tu pago" />
        <div className="form-row">
          <Field
            label="¿Quién pagó? (nombre y apellido)"
            hint={
              recognized === 'si' && payer
                ? `Lo leímos en la captura: ${payer.name}. Cámbialo si no es correcto.`
                : recognized === 'no'
                  ? 'La captura no muestra quién pagó: confirma el nombre.'
                  : undefined
            }
          >
            <Select
              value={payerId}
              onChange={(event) => {
                payerTouched.current = true
                setPayerId(event.target.value)
              }}
            >
              <option value="">Elige el nombre</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Monto (S/)">
            <Input
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              value={amount}
              onChange={(event) => {
                touched.current = true
                setAmount(event.target.value)
              }}
            />
          </Field>
        </div>
        <Field label="N.° de operación" hint="Se completa solo si se lee en la captura">
          <Input value={operation} onChange={(event) => setOperation(event.target.value)} placeholder="Opcional" inputMode="numeric" />
        </Field>
        {previous.length > 0 ? (
          <p className="notice-inline">
            {payer?.name.split(' ')[0]} ya tiene {previous.length === 1 ? 'una cuota registrada' : `${previous.length} cuotas registradas`} por{' '}
            {money(previous.reduce((acc, item) => acc + item.amount, 0))}. Si es un pago adicional, continúa.
          </p>
        ) : null}
        {!voucher.image ? <p className="muted small">La foto es obligatoria: así cualquiera del equipo puede validarla.</p> : null}
      </div>
    </Modal>
  )
}

/**
 * Estado de validación de una constancia: si falta validar, es un botón de un clic.
 * Sin imán elegido no se puede firmar la validación, así que se avisa.
 */
export function ValidateButton({ item }: { item: BudgetItem }) {
  const { actor, mutate, toast } = useStore()
  const [busy, setBusy] = useState(false)
  if (!item.has_receipt) return null
  if (item.validated_by) {
    return (
      <span className="tag-ok" title={`Validado por ${item.validated_by_name || ''}`}>
        <Icon name="check" size={12} /> validado{item.validated_by_name ? ` · ${item.validated_by_name.split(' ')[0]}` : ''}
      </span>
    )
  }
  const validate = async () => {
    if (!actor) {
      toast('Primero elige tu imán (arriba a la derecha) para firmar la validación', 'error')
      return
    }
    setBusy(true)
    await mutate(() => api.validateBudget(item.id, true), `Validaste “${item.concept}”`)
    setBusy(false)
  }
  return (
    <button type="button" className="validate-btn" disabled={busy} onClick={() => void validate()} title="Marcar la constancia como revisada">
      <Icon name="check" size={13} /> {busy ? 'Validando…' : 'Validar'}
    </button>
  )
}

/** Ver la constancia de un movimiento y validarla. */
export function ReceiptViewer({ item, onClose }: { item: BudgetItem; onClose: () => void }) {
  const { data, actor, setActor, mutate } = useStore()
  const [image, setImage] = useState<string | null>(item.receipt_url || null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (image || !item.has_receipt) return
    let alive = true
    api
      .getReceipt(item.id)
      .then((res) => alive && setImage(res.receipt_url))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [item.id, item.has_receipt, image])

  const validated = Boolean(item.validated_by)
  const toggle = () =>
    mutate(
      () => api.validateBudget(item.id, !validated),
      validated ? 'Validación retirada' : `Validaste ${item.kind === 'ingreso' ? 'el pago' : 'el gasto'}`,
    ).then((ok) => ok && onClose())

  return (
    <Modal
      open
      onClose={onClose}
      title={item.concept}
      description={`${item.kind === 'ingreso' ? 'Ingreso' : 'Gasto'} de ${money(item.amount)}${item.due_date ? ` · ${formatDate(item.due_date)}` : ''}`}
      footer={
        <>
          {validated ? (
            <Badge tone="success">Validado por {item.validated_by_name?.split(' ')[0] || 'alguien'}</Badge>
          ) : actor ? (
            <Badge tone="warning">Por validar</Badge>
          ) : (
            <label className="validate-as">
              <span>Validar como</span>
              <select
                className="input select"
                value=""
                onChange={(event) => setActor(data?.members.find((m) => m.id === Number(event.target.value)) || null)}
              >
                <option value="">Elige tu nombre…</option>
                {data?.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="spacer" />
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          {item.has_receipt ? (
            <Button
              variant={validated ? 'outline' : 'success'}
              icon={validated ? undefined : 'check'}
              disabled={!actor || !image}
              title={actor ? undefined : 'Elige tu imán arriba para validar'}
              onClick={() => void toggle()}
            >
              {validated ? 'Quitar validación' : 'Validar'}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="receipt-view">
        {item.has_receipt ? (
          image ? (
            <img src={image} alt={`Constancia de ${item.concept}`} />
          ) : failed ? (
            <p className="field-error">No se pudo cargar la foto. Revisa tu conexión.</p>
          ) : (
            <div className="receipt-loading">
              <span className="spinner" /> Cargando la constancia…
            </div>
          )
        ) : (
          <p className="muted">Este movimiento no tiene foto de constancia.</p>
        )}
        <dl className="receipt-facts">
          <div>
            <dt>{item.kind === 'ingreso' ? 'Pagó' : 'Responsable'}</dt>
            <dd>{item.owner_name || '—'}</dd>
          </div>
          {item.note ? (
            <div>
              <dt>Detalle</dt>
              <dd>{item.note}</dd>
            </div>
          ) : null}
          <div>
            <dt>Estado</dt>
            <dd>{item.status === 'hecho' ? (item.kind === 'ingreso' ? 'Cobrado' : 'Pagado') : 'Pendiente'}</dd>
          </div>
        </dl>
      </div>
    </Modal>
  )
}

/** Quién ya pagó su cuota y quién falta. */
export function CuotasPanel({
  members,
  budget,
  onOpen,
  onPay,
}: {
  members: Member[]
  budget: BudgetItem[]
  onOpen: (item: BudgetItem) => void
  onPay: () => void
}) {
  const { actor } = useStore()
  const cuotas = budget.filter((item) => isCuota(item) && item.status === 'hecho')
  const collected = cuotas.reduce((acc, item) => acc + item.amount, 0)
  // Cuotas cargadas sin decir quién pagó: suman, pero no se ven en la lista.
  const unnamed = cuotas.filter((item) => !item.owner_id || !members.some((member) => member.id === item.owner_id))
  const paidIds = new Set(cuotas.map((item) => item.owner_id))
  const pendingValidation = cuotas.filter((item) => !item.validated_by).length
  const mine = actor ? cuotas.filter((item) => item.owner_id === actor.id) : []

  return (
    <section className="card cuotas" aria-label="Cuotas del equipo">
      <header className="card-head">
        <div>
          <h2>¿Quién ya pagó?</h2>
          <p className="muted small">
            {paidIds.size} de {members.length} · {pendingValidation > 0 ? `${pendingValidation} por validar` : 'todo validado'}
          </p>
        </div>
        {actor && mine.length === 0 ? (
          <Button icon="camera" onClick={onPay}>
            Subir mi cuota
          </Button>
        ) : null}
      </header>
      <p className="cuota-total">
        Recaudado <strong>{money(collected)}</strong>
      </p>
      {unnamed.length > 0 ? (
        <p className="notice-inline cuota-unnamed">
          {unnamed.length === 1 ? 'Hay 1 cuota' : `Hay ${unnamed.length} cuotas`} sin nombre de quién pagó ({money(unnamed.reduce((acc, item) => acc + item.amount, 0))}).{' '}
          <button type="button" className="link-btn" onClick={() => onOpen(unnamed[0])}>
            Revisar
          </button>
        </p>
      ) : null}
      <ul className="cuota-list">
        {members.map((member) => {
          const items = cuotas.filter((item) => item.owner_id === member.id)
          const total = items.reduce((acc, item) => acc + item.amount, 0)
          const last = items[items.length - 1]
          const validated = items.length > 0 && items.every((item) => item.validated_by)
          return (
            <li key={member.id} className={items.length ? (validated ? 'is-validated' : 'is-paid') : ''}>
              {last ? (
                <button type="button" onClick={() => onOpen(last)} aria-label={`Ver constancia de ${member.name}`}>
                  <Avatar member={member} size="sm" />
                  <span className="cuota-name">{member.name.split(' ')[0]}</span>
                  <span className="cuota-state">
                    {money(total)} · {validated ? 'validado' : 'por validar'}
                  </span>
                </button>
              ) : (
                <div>
                  <Avatar member={member} size="sm" />
                  <span className="cuota-name">{member.name.split(' ')[0]}</span>
                  <span className="cuota-state">pendiente</span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Flujo de caja: solo lo cobrado y pagado, en orden, con el saldo acumulado. */
export function FlowView({ budget, members, onOpen }: { budget: BudgetItem[]; members: Member[]; onOpen: (item: BudgetItem) => void }) {
  const done = budget
    .filter((item) => item.status === 'hecho')
    .map((item) => ({ item, date: item.due_date || item.created_at.slice(0, 10) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.item.id - b.item.id)
  const ingresos = done.filter(({ item }) => item.kind === 'ingreso').reduce((acc, { item }) => acc + item.amount, 0)
  const gastos = done.filter(({ item }) => item.kind === 'gasto').reduce((acc, { item }) => acc + item.amount, 0)
  const porCobrar = budget.filter((item) => item.kind === 'ingreso' && item.status !== 'hecho').reduce((acc, item) => acc + item.amount, 0)
  const porPagar = budget.filter((item) => item.kind === 'gasto' && item.status !== 'hecho').reduce((acc, item) => acc + item.amount, 0)

  let running = 0
  const rows = done.map(({ item, date }) => {
    running += item.kind === 'ingreso' ? item.amount : -item.amount
    return { item, date, balance: running }
  })

  return (
    <div className="stack">
      <section className="flow-summary" aria-label="Resumen del flujo">
        <div className="flow-fig income">
          <span>Ingresos</span>
          <strong>{money(ingresos)}</strong>
          <small>{porCobrar > 0 ? `+ ${money(porCobrar)} por cobrar` : 'todo cobrado'}</small>
        </div>
        <div className="flow-fig expense">
          <span>Gastos</span>
          <strong>{money(gastos)}</strong>
          <small>{porPagar > 0 ? `+ ${money(porPagar)} por pagar` : 'todo pagado'}</small>
        </div>
        <div className={`flow-fig balance ${ingresos - gastos < 0 ? 'is-negative' : ''}`}>
          <span>Saldo en caja</span>
          <strong>{money(ingresos - gastos)}</strong>
          <small>con lo cobrado y pagado</small>
        </div>
      </section>

      {rows.length === 0 ? (
        <p className="muted">Aún no hay cobros ni pagos registrados.</p>
      ) : (
        <ol className="flow-list">
          {rows.map(({ item, date, balance }) => {
            const owner = members.find((member) => member.id === item.owner_id)
            return (
              <li key={item.id} className={item.kind}>
                <div
                  className="flow-row"
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest('.validate-btn')) return
                    onOpen(item)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && event.target === event.currentTarget) onOpen(item)
                  }}
                >
                  <span className="flow-date">{formatDate(date)}</span>
                  <span className="flow-main">
                    <span className="flow-concept">
                      {item.concept}
                      {item.has_receipt ? <Icon name="camera" size={13} /> : null}
                    </span>
                    <span className="flow-meta">
                      {owner ? <Magnet member={owner} /> : null}
                      <ValidateButton item={item} />
                    </span>
                  </span>
                  <span className={`flow-amount ${item.kind}`}>
                    {item.kind === 'ingreso' ? '+' : '−'} {money(item.amount)}
                  </span>
                  <span className={`flow-balance ${balance < 0 ? 'is-negative' : ''}`}>{money(balance)}</span>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
