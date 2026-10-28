import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import { Button, EmptyState, Field, Icon, IconButton, Input, Modal, PageHeader, Select, TextArea } from '../components/ui'
import { ShareButton } from '../components/share'
import type { Agreement, AgreementStatus } from '../types'
import { AGREEMENT_STATUS_META, deadlineLabel, formatDate, formatLongDate } from '../lib/format'

const STATUS_EMOJI: Record<AgreementStatus, string> = { propuesto: '🟡', acordado: '🤝', cumplido: '✅' }

/** Un acuerdo listo para mandar por chat (los * son negritas en WhatsApp y Telegram). */
function agreementText(agreement: Agreement): string {
  return [
    `${STATUS_EMOJI[agreement.status]} *${agreement.title}*`,
    agreement.detail,
    `Estado: ${AGREEMENT_STATUS_META[agreement.status].label}`,
    agreement.owner_name ? `Responsable: ${agreement.owner_name}` : '',
    agreement.due_date ? `Fecha: ${formatDate(agreement.due_date)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

const ORDER: AgreementStatus[] = ['propuesto', 'acordado', 'cumplido']

export function Agreements() {
  const { data, mutate } = useStore()
  const [filter, setFilter] = useState<'todos' | AgreementStatus>('todos')
  const [editing, setEditing] = useState<Agreement | 'nuevo' | null>(null)

  if (!data) return null

  const list = useMemo(
    () => data.agreements.filter((agreement) => (filter === 'todos' ? true : agreement.status === filter)),
    [data.agreements, filter],
  )

  const counts = {
    todos: data.agreements.length,
    propuesto: data.agreements.filter((item) => item.status === 'propuesto').length,
    acordado: data.agreements.filter((item) => item.status === 'acordado').length,
    cumplido: data.agreements.filter((item) => item.status === 'cumplido').length,
  }

  const advance = (agreement: Agreement, status: AgreementStatus) =>
    mutate(() => api.updateAgreement(agreement.id, { status }), `Acuerdo marcado como ${AGREEMENT_STATUS_META[status].label.toLowerCase()}`)

  const remove = async (agreement: Agreement) => {
    if (!window.confirm(`¿Eliminar el acuerdo “${agreement.title}”?`)) return
    await mutate(() => api.deleteAgreement(agreement.id), 'Acuerdo eliminado')
  }

  return (
    <div className="stack">
      <PageHeader
        title="Acuerdos"
        subtitle="Lo que el equipo decidió y cómo se va cumpliendo"
        action={
          <div className="btn-group">
            {data.agreements.length > 0 ? (
              <ShareButton
                title={`Acuerdos · ${data.settings.event_name}`}
                label="Compartir acuerdos"
                text={() => {
                  const groups = ORDER.map((status) => {
                    const items = data.agreements.filter((item) => item.status === status)
                    if (items.length === 0) return ''
                    const lines = items.map(
                      (item) =>
                        `• ${item.title}${item.owner_name ? ` (${item.owner_name.split(' ')[0]})` : ''}${item.due_date ? ` · ${formatDate(item.due_date)}` : ''}`,
                    )
                    return [`${STATUS_EMOJI[status]} *${AGREEMENT_STATUS_META[status].label}s*`, ...lines].join('\n')
                  }).filter(Boolean)
                  return [
                    `🥐 *${data.settings.event_name} · Acuerdos*`,
                    `${formatLongDate(data.settings.event_date)}${data.settings.event_time ? ` · ${data.settings.event_time}` : ''}`,
                    '',
                    groups.join('\n\n'),
                  ].join('\n')
                }}
              />
            ) : null}
            <Button icon="plus" onClick={() => setEditing('nuevo')}>
              Nuevo acuerdo
            </Button>
          </div>
        }
      />

      <div className="segmented">
        <button className={filter === 'todos' ? 'is-active' : ''} onClick={() => setFilter('todos')}>
          Todos <span className="seg-count">{counts.todos}</span>
        </button>
        {ORDER.map((key) => (
          <button key={key} className={filter === key ? 'is-active' : ''} onClick={() => setFilter(key)}>
            {AGREEMENT_STATUS_META[key].label} <span className="seg-count">{counts[key]}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState icon="handshake" title="Todavía no hay acuerdos" hint="Registra las decisiones del equipo para que nadie las olvide." />
      ) : (
        <div className="agreement-list">
          {list.map((agreement) => {
            const due = deadlineLabel(agreement.due_date)
            const next: AgreementStatus | null =
              agreement.status === 'propuesto' ? 'acordado' : agreement.status === 'acordado' ? 'cumplido' : null
            return (
              <article key={agreement.id} className={`agreement status-${agreement.status}`}>
                <div className="agreement-body">
                  <div className="agreement-top">
                    <span className={`badge tone-${AGREEMENT_STATUS_META[agreement.status].tone}`}>
                      {AGREEMENT_STATUS_META[agreement.status].label}
                    </span>
                    <span className={`due-chip tone-${due.tone}`}>
                      <Icon name="calendar" size={14} /> {formatDate(agreement.due_date)}
                    </span>
                  </div>
                  <h3>{agreement.title}</h3>
                  {agreement.detail ? <p className="muted small">{agreement.detail}</p> : null}
                  <div className="agreement-foot">
                    <span className="small muted">
                      <Icon name="user" size={14} /> {agreement.owner_name || 'Sin responsable'}
                    </span>
                    <span className="spacer" />
                    {next ? (
                      <Button size="sm" variant={next === 'cumplido' ? 'soft' : 'primary'} icon="check" onClick={() => void advance(agreement, next)}>
                        {next === 'acordado' ? 'Marcar acordado' : 'Marcar cumplido'}
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => void advance(agreement, 'acordado')}>
                        Reabrir
                      </Button>
                    )}
                    <ShareButton
                      compact
                      label="Compartir este acuerdo"
                      title={agreement.title}
                      text={() => `🥐 *${data.settings.event_name}*\n\n${agreementText(agreement)}`}
                    />
                    <IconButton icon="pencil" label="Editar acuerdo" onClick={() => setEditing(agreement)} />
                    <IconButton icon="trash" label="Eliminar acuerdo" onClick={() => void remove(agreement)} />
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <div className="card info-card">
        <Icon name="info" />
        <div>
          <p className="mini-title">Cómo usar los acuerdos</p>
          <p className="small muted">
            Cualquier propuesta entra como <strong>Propuesto</strong>. Cuando el equipo la valida pasa a{' '}
            <strong>Acordado</strong>, y cuando se ejecuta queda como <strong>Cumplido</strong>. Así saben qué está
            decidido y qué falta conversar.
          </p>
        </div>
      </div>

      {editing ? (
        <AgreementEditor
          agreement={editing === 'nuevo' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}

function AgreementEditor({ agreement, onClose }: { agreement: Agreement | null; onClose: () => void }) {
  const { data, mutate } = useStore()
  const [title, setTitle] = useState(agreement?.title ?? '')
  const [detail, setDetail] = useState(agreement?.detail ?? '')
  const [status, setStatus] = useState<AgreementStatus>(agreement?.status ?? 'propuesto')
  const [ownerId, setOwnerId] = useState(String(agreement?.owner_id ?? ''))
  const [dueDate, setDueDate] = useState(agreement?.due_date ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    const payload = {
      title: title.trim(),
      detail,
      status,
      owner_id: ownerId ? Number(ownerId) : null,
      due_date: dueDate || null,
    }
    const ok = await mutate(
      () => (agreement ? api.updateAgreement(agreement.id, payload) : api.createAgreement(payload)),
      agreement ? 'Acuerdo actualizado' : 'Acuerdo creado',
    )
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={agreement ? 'Editar acuerdo' : 'Nuevo acuerdo'}
      description="Deja claro qué se decidió, quién lo sigue y para cuándo."
      footer={
        <>
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
        <Field label="Acuerdo">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej. Aporte de S/ 100 por integrante" autoFocus />
        </Field>
        <Field label="Detalle">
          <TextArea rows={3} value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Condiciones, alcance, excepciones…" />
        </Field>
        <div className="form-row">
          <Field label="Estado">
            <Select value={status} onChange={(event) => setStatus(event.target.value as AgreementStatus)}>
              {ORDER.map((key) => (
                <option key={key} value={key}>
                  {AGREEMENT_STATUS_META[key].label}
                </option>
              ))}
            </Select>
          </Field>
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
          <Field label="Fecha límite">
            <Input type="date" value={dueDate ?? ''} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
