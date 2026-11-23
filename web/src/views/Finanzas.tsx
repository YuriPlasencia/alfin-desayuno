import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { finanzas, platform } from '../api'
import { Brand } from '../components/brand'
import { Button, EmptyState, Field, Icon, IconButton, Input, Modal, Select } from '../components/ui'
import { soles } from '../lib/format'
import { compressImageFile } from '../lib/image'
import { fileToDataUrl, readPdf } from '../lib/pdf'
import type { FinDraft, FinEntry, FinKind, FinLine, FinState } from '../types'
import { FinanzasPanel } from './FinanzasPanel'
import '../finanzas.css'

type Tab = 'resumen' | 'ingresos' | 'gastos' | 'inversiones'
const TABS: { id: Tab; label: string }[] = [
  { id: 'resumen', label: 'Panel' },
  { id: 'ingresos', label: 'Ingresos' },
  { id: 'gastos', label: 'Gastos' },
  { id: 'inversiones', label: 'Inversiones' },
]
const KIND_OF: Record<Exclude<Tab, 'resumen'>, FinKind> = { ingresos: 'ingreso', gastos: 'gasto', inversiones: 'inversion' }

const readTab = (): Tab => {
  const hash = window.location.hash.replace(/^#\/?/, '') as Tab
  return TABS.some((t) => t.id === hash) ? hash : 'resumen'
}
const thisMonth = () => new Date().toISOString().slice(0, 7)
const today = () => new Date().toISOString().slice(0, 10)
const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100

/** Lo que se edita en el formulario: un movimiento guardado o el borrador de una boleta. */
type Editing = {
  kind: FinKind
  entry: FinEntry | null
  draft: FinDraft | null
  docId: number | null
  source: 'manual' | 'ocr' | 'ia'
  warning: string
}

export function Finanzas() {
  const [tab, setTab] = useState<Tab>(readTab)
  const [month, setMonth] = useState(thisMonth)
  const [state, setState] = useState<FinState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [scanning, setScanning] = useState(false)

  const load = useCallback(() => {
    finanzas
      .list(month)
      .then((next) => {
        setState(next)
        setError(null)
      })
      .catch((err) => {
        if (err?.status === 401) window.location.href = '/?next=' // sin sesión: vuelve a la portada
        setError(err instanceof Error ? err.message : 'No se pudo cargar')
      })
  }, [month])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    const onHash = () => setTab(readTab())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    document.title = 'Mis finanzas · Juntay'
  }, [])

  const go = (next: Tab) => {
    setTab(next)
    window.location.hash = `#/${next}`
  }

  /** Foto o PDF → lectura → borrador para revisar. */
  const scan = async (kind: 'ingreso' | 'gasto', file: File) => {
    setScanning(true)
    setError(null)
    try {
      let body: { kind: 'ingreso' | 'gasto'; file: string; text?: string; image?: string }
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        if (file.size > 8 * 1024 * 1024) throw new Error('El PDF pesa más de 8 MB')
        const [data, read] = await Promise.all([fileToDataUrl(file), readPdf(file)])
        body = { kind, file: data.replace(/^data:[^;]*;/, 'data:application/pdf;'), text: read.text, image: read.image || undefined }
      } else {
        // Comprimida pero legible: el OCR necesita ver las letras chicas de la boleta.
        const image = await compressImageFile(file, 1800, 0.85).catch(() => {
          throw new Error('No se pudo abrir esa imagen. Usa una foto JPG o PNG.')
        })
        body = { kind, file: image }
      }
      const result = await finanzas.scan(body)
      setEditing({ kind, entry: null, draft: result.draft, docId: result.doc_id, source: result.draft ? result.source : 'manual', warning: result.warning })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer la boleta')
    } finally {
      setScanning(false)
    }
  }

  const entries = state?.entries ?? []
  const byKind = (kind: FinKind) => entries.filter((e) => e.kind === kind)

  return (
    <div className="portal fin">
      <header className="portal-top">
        <a href="/" className="brand-link" title="Volver a Juntay">
          <Brand subtitle="Mis finanzas" />
        </a>
        <div className="portal-user">
          <a className="btn btn-ghost btn-sm" href="/" onClick={() => localStorage.setItem('juntay.categoria', 'trabajo')}>
            <Icon name="users" size={16} /> Mis eventos
          </a>
          <Button variant="ghost" size="sm" onClick={() => void platform.logout().finally(() => (window.location.href = '/'))}>
            Salir
          </Button>
        </div>
      </header>

      <main className="portal-main stack">
        <div className="page-head">
          <div>
            <h1>Mis finanzas</h1>
            <p className="muted">Sube tus boletas y Juntay llena las líneas. Revisa y guarda.</p>
          </div>
          {tab !== 'inversiones' ? (
            <label className="fin-month">
              <span className="small muted">Mes</span>
              <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
            </label>
          ) : null}
        </div>

        <div className="segmented fin-tabs" role="tablist" aria-label="Secciones de finanzas">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-active' : ''} onClick={() => go(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {error ? (
          <p className="gate-error" role="alert">
            {error}
          </p>
        ) : null}
        {state && !state.ai && tab !== 'resumen' && tab !== 'inversiones' ? (
          <p className="fin-note small muted">
            <Icon name="info" size={15} /> La lectura automática es gratuita y a veces se equivoca: revisa las líneas antes de guardar.
          </p>
        ) : null}

        {!state ? (
          <div className="splash-inline">
            <span className="spinner" />
          </div>
        ) : tab === 'resumen' ? (
          <FinanzasPanel month={month} onGo={go} />
        ) : tab === 'inversiones' ? (
          <Investments entries={byKind('inversion')} onAdd={() => setEditing({ kind: 'inversion', entry: null, draft: null, docId: null, source: 'manual', warning: '' })} onOpen={(entry) => setEditing({ kind: 'inversion', entry, draft: null, docId: entry.doc_id, source: entry.source, warning: '' })} />
        ) : (
          <Movements
            kind={KIND_OF[tab]}
            entries={byKind(KIND_OF[tab])}
            scanning={scanning}
            onScan={(file) => void scan(KIND_OF[tab] as 'ingreso' | 'gasto', file)}
            onAdd={() => setEditing({ kind: KIND_OF[tab], entry: null, draft: null, docId: null, source: 'manual', warning: '' })}
            onOpen={(entry) => setEditing({ kind: entry.kind, entry, draft: null, docId: entry.doc_id, source: entry.source, warning: '' })}
          />
        )}
      </main>

      {editing && state ? (
        <EntryEditor
          editing={editing}
          catalog={state.catalog}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      ) : null}
    </div>
  )
}

// ---------- ingresos y gastos ----------

function Movements({
  kind,
  entries,
  scanning,
  onScan,
  onAdd,
  onOpen,
}: {
  kind: FinKind
  entries: FinEntry[]
  scanning: boolean
  onScan: (file: File) => void
  onAdd: () => void
  onOpen: (entry: FinEntry) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const isIncome = kind === 'ingreso'
  return (
    <div className="stack">
      <div className="fin-actions">
        <Button icon="camera" disabled={scanning} onClick={() => input.current?.click()}>
          {scanning ? 'Leyendo la boleta…' : isIncome ? 'Subir boleta de pago' : 'Subir boleta o recibo'}
        </Button>
        <Button variant="outline" icon="plus" onClick={onAdd}>
          Agregar a mano
        </Button>
        <span className="small muted">Foto, JPG, PNG, WEBP o PDF</span>
        <input
          ref={input}
          type="file"
          accept="image/*,application/pdf,.pdf"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) onScan(file)
          }}
        />
      </div>
      {entries.length === 0 ? (
        <EmptyState
          icon={isIncome ? 'download' : 'upload'}
          title={isIncome ? 'Sin ingresos este mes' : 'Sin gastos este mes'}
          hint={isIncome ? 'Sube tu boleta de pago: se llenan el neto y cada concepto.' : 'Sube la boleta del súper: cada producto queda con su rubro.'}
        />
      ) : (
        <div className="card table-card">
          <table className="data-table fin-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>{isIncome ? 'Concepto' : 'Comercio / concepto'}</th>
                <th>Categoría</th>
                <th className="num">Monto</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} onClick={() => onOpen(entry)} className="is-clickable">
                  <td className="nowrap">{entry.date.slice(8, 10)}/{entry.date.slice(5, 7)}</td>
                  <td>
                    <strong>{entry.concept || entry.merchant}</strong>
                    {entry.merchant && entry.concept && !entry.concept.toLowerCase().includes(entry.merchant.toLowerCase()) ? (
                      <span className="small muted"> · {entry.merchant}</span>
                    ) : null}
                    {entry.lines.length ? <span className="small muted"> · {entry.lines.length} líneas</span> : null}
                    {entry.has_doc ? <Icon name="clipboard" size={13} /> : null}
                  </td>
                  <td>{entry.category}</td>
                  <td className="num">{soles(entry.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total del mes</td>
                <td className="num">{soles(sum(entries.map((e) => e.amount)))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------- inversiones ----------

function Investments({ entries, onAdd, onOpen }: { entries: FinEntry[]; onAdd: () => void; onOpen: (entry: FinEntry) => void }) {
  return (
    <div className="stack">
      <div className="fin-actions">
        <Button icon="plus" onClick={onAdd}>
          Agregar inversión
        </Button>
        <span className="small muted">Depósitos, fondos, acciones, AFP voluntario, cripto…</span>
      </div>
      {entries.length === 0 ? (
        <EmptyState icon="chart" title="Aún no registras inversiones" hint="Anota cuánto pusiste y actualiza su valor cuando quieras ver cuánto ganó." />
      ) : (
        <div className="fin-invest">
          {entries.map((entry) => {
            const current = entry.current_value ?? entry.amount
            const gain = current - entry.amount
            const pct = entry.amount ? (gain / entry.amount) * 100 : 0
            return (
              <button type="button" key={entry.id} className="card fin-invest-card" onClick={() => onOpen(entry)}>
                <span className="fin-tile-label">{entry.category}</span>
                <strong>{entry.concept || entry.merchant}</strong>
                {entry.merchant && entry.concept ? <span className="small muted">{entry.merchant}</span> : null}
                <span className="fin-invest-row">
                  <span className="small muted">Invertido {soles(entry.amount)}</span>
                  <span className={`fin-gain ${gain < 0 ? 'is-negative' : ''}`}>
                    {soles(current)} ({gain >= 0 ? '+' : ''}
                    {pct.toFixed(1)}%)
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------- editor ----------

function DocViewer({ docId }: { docId: number }) {
  const [doc, setDoc] = useState<{ mime: string; data: string } | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (open && !doc) finanzas.doc(docId).then(setDoc).catch(() => setOpen(false))
  }, [open, doc, docId])
  const pdfUrl = useMemo(() => {
    if (!doc || doc.mime !== 'application/pdf') return ''
    const bytes = Uint8Array.from(atob(doc.data.split(',')[1] || ''), (c) => c.charCodeAt(0))
    return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  }, [doc])
  useEffect(() => () => (pdfUrl ? URL.revokeObjectURL(pdfUrl) : undefined), [pdfUrl])
  if (!open) {
    return (
      <button type="button" className="link-btn" onClick={() => setOpen(true)}>
        <Icon name="clipboard" size={14} /> Ver la boleta original
      </button>
    )
  }
  if (!doc) return <span className="spinner" />
  return doc.mime === 'application/pdf' ? (
    <a className="link-btn" href={pdfUrl} target="_blank" rel="noreferrer">
      Abrir el PDF en otra pestaña
    </a>
  ) : (
    <img src={doc.data} alt="Boleta original" className="fin-doc" />
  )
}

function EntryEditor({
  editing,
  catalog,
  onClose,
  onSaved,
}: {
  editing: Editing
  catalog: FinState['catalog']
  onClose: () => void
  onSaved: () => void
}) {
  const { kind, entry, draft } = editing
  const base = entry ?? draft
  const isIncome = kind === 'ingreso'
  const isInvest = kind === 'inversion'
  const categories = isIncome ? catalog.ingreso : isInvest ? catalog.inversion : catalog.gasto
  const lineTypes = isIncome ? catalog.lineasIngreso : catalog.rubros

  const [date, setDate] = useState(base?.date || today())
  const [concept, setConcept] = useState(base?.concept || '')
  const [merchant, setMerchant] = useState(base?.merchant || '')
  const [category, setCategory] = useState(base && categories.includes(base.category) ? base.category : categories[0])
  const [amount, setAmount] = useState(base ? String(base.amount) : '')
  const [current, setCurrent] = useState(entry?.current_value != null ? String(entry.current_value) : '')
  const [note, setNote] = useState(entry?.note || '')
  const [lines, setLines] = useState<FinLine[]>(base?.lines ? base.lines.map((l) => ({ ...l })) : [])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const linesTotal = sum(lines.map((l) => Number(l.amount) || 0))
  const setLine = (index: number, patch: Partial<FinLine>) => setLines((list) => list.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  const showRubros = !isIncome && category === 'Supermercado'

  const save = async () => {
    setBusy(true)
    setMessage(null)
    const body = {
      date,
      concept: concept.trim(),
      merchant: merchant.trim(),
      category,
      amount: Number(amount) || 0,
      current_value: isInvest && current !== '' ? Number(current) : null,
      note: note.trim(),
      lines: isInvest ? [] : lines.filter((l) => l.description.trim() || l.amount),
    }
    try {
      if (entry) await finanzas.update(entry.id, body)
      else await finanzas.create({ ...body, kind, doc_id: editing.docId, source: editing.source })
      onSaved()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo guardar')
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!entry || !window.confirm('¿Borrar este movimiento? No se puede deshacer.')) return
    setBusy(true)
    await finanzas.remove(entry.id).catch(() => {})
    onSaved()
  }

  const title = entry ? 'Editar' : draft ? 'Revisa lo que se leyó' : isIncome ? 'Nuevo ingreso' : isInvest ? 'Nueva inversión' : 'Nuevo gasto'

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={title}
      description={
        draft
          ? editing.source === 'ia'
            ? 'Leído con IA. Revisa y guarda.'
            : 'Leído automáticamente. Revisa cada línea y corrige lo que haga falta.'
          : undefined
      }
      footer={
        <>
          {entry ? (
            <Button variant="ghost" icon="trash" disabled={busy} onClick={() => void remove()}>
              Borrar
            </Button>
          ) : null}
          <span className="spacer" />
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={busy || (!concept.trim() && !merchant.trim())}>
            {busy ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        {editing.warning ? <p className="fin-note small">{editing.warning}</p> : null}
        <div className="form-row">
          <Field label={isInvest ? 'Tipo' : 'Categoría'}>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label={isInvest ? 'Desde' : 'Fecha'}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <div className="form-row">
          <Field label={isIncome ? 'Concepto' : isInvest ? 'Nombre' : 'Concepto'}>
            <Input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder={isIncome ? 'Ej. Sueldo de noviembre' : isInvest ? 'Ej. Depósito a 12 meses' : 'Ej. Compra semanal'} />
          </Field>
          <Field label={isIncome ? 'Empleador o cliente' : isInvest ? 'Entidad' : 'Comercio'}>
            <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder={isIncome ? 'Ej. Empresa S.A.C.' : isInvest ? 'Ej. BCP, Interbank' : 'Ej. Plaza Vea'} />
          </Field>
        </div>
        <div className="form-row">
          <Field label={isIncome ? 'Neto recibido (S/)' : isInvest ? 'Monto invertido (S/)' : 'Total (S/)'}>
            <Input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          {isInvest ? (
            <Field label="Valor actual (S/)" hint="Actualízalo para ver cuánto ganaste">
              <Input type="number" inputMode="decimal" min="0" step="0.01" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </Field>
          ) : null}
        </div>

        {!isInvest ? (
          <div className="fin-lines">
            <div className="fin-lines-head">
              <h3 className="section-title">{isIncome ? 'Conceptos de la boleta' : 'Líneas de la boleta'}</h3>
              {lines.length ? (
                <span className={`small ${Math.abs(linesTotal - (Number(amount) || 0)) > 0.05 ? 'danger-text' : 'muted'}`}>
                  Suma de líneas {soles(linesTotal)}
                  {Math.abs(linesTotal - (Number(amount) || 0)) > 0.05 ? (
                    <>
                      {' · '}
                      <button type="button" className="link-btn" onClick={() => setAmount(String(linesTotal))}>
                        usar como total
                      </button>
                    </>
                  ) : null}
                </span>
              ) : null}
            </div>
            {lines.length ? (
              <ul className="fin-line-list">
                {lines.map((line, index) => (
                  <li key={index} className={showRubros || isIncome ? 'has-type' : ''}>
                    <Input value={line.description} onChange={(e) => setLine(index, { description: e.target.value })} placeholder="Descripción" aria-label="Descripción" />
                    {showRubros || isIncome ? (
                      <Select value={line.rubro || lineTypes[0]} onChange={(e) => setLine(index, { rubro: e.target.value })} aria-label={isIncome ? 'Tipo' : 'Rubro'}>
                        {lineTypes.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </Select>
                    ) : null}
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={String(line.amount)}
                      onChange={(e) => setLine(index, { amount: Number(e.target.value) })}
                      aria-label="Monto"
                      className="num"
                    />
                    <IconButton icon="trash" label="Quitar línea" onClick={() => setLines((list) => list.filter((_, i) => i !== index))} />
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              className="link-btn"
              onClick={() => setLines((list) => [...list, { description: '', quantity: 1, amount: 0, rubro: isIncome ? 'Ingreso' : showRubros ? 'Abarrotes' : '' }])}
            >
              <Icon name="plus" size={14} /> Agregar línea
            </button>
            {isIncome ? <p className="small muted">Los descuentos (AFP, ONP, renta) van en negativo.</p> : null}
          </div>
        ) : null}

        <Field label="Nota (opcional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {editing.docId ? <DocViewer docId={editing.docId} /> : null}
        {message ? (
          <p className="gate-error" role="alert">
            {message}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
