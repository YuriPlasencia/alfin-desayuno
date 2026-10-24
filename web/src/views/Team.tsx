import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import {
  Button,
  Field,
  Icon,
  IconButton,
  Magnet,
  Input,
  Modal,
  PageHeader,
  Select,
} from '../components/ui'
import { AREAS, AREA_COLORS, type Member } from '../types'
import { summarize } from '../lib/stats'

const COLOR_OPTIONS = ['#E4572E', '#D98E04', '#2F8F5B', '#3B6EA5', '#8B5CF6', '#C2412D', '#0E7490', '#A16207', '#DB2777', '#475569']

export function Team() {
  const { data, actor, mutate } = useStore()
  const [editing, setEditing] = useState<Member | 'nuevo' | null>(null)

  const summary = useMemo(() => (data ? summarize(data) : null), [data])
  if (!data || !summary) return null

  const sinTareas = data.members.filter((member) => (summary.workload[member.id]?.total ?? 0) === 0)

  const remove = async (member: Member) => {
    if (!window.confirm(`¿Retirar a ${member.name} del equipo? Sus actividades quedarán sin responsable.`)) return
    await mutate(() => api.deleteMember(member.id), 'Integrante retirado')
  }

  return (
    <div className="stack">
      <PageHeader
        title="Equipo"
        subtitle={`${data.members.length} personas con un rol claro para atender a ${data.settings.guests} invitados`}
        action={
          <Button icon="plus" onClick={() => setEditing('nuevo')}>
            Agregar integrante
          </Button>
        }
      />

      <section className="board magnet-wall" aria-label="Pizarra del equipo">
        <div className="team-meter-row">
          <p>
            <strong>{data.tasks.filter((task) => task.status !== 'hecha').length}</strong> actividades abiertas repartidas entre el equipo
          </p>
          <p className="muted small">
            {sinTareas.length === 0
              ? 'Todo el equipo tiene algo asignado'
              : `Sin actividad: ${sinTareas.map((m) => m.name.split(' ')[0]).join(', ')}`}
          </p>
        </div>
        <ul className="roster">
          {data.members.map((member) => {
            const workload = summary.workload[member.id] ?? { open: 0, done: 0, total: 0 }
            return (
              <li key={member.id} className={actor?.id === member.id ? 'is-me' : ''}>
                <div className="roster-who">
                  <Magnet member={member} me={actor?.id === member.id} />
                  {member.is_lead ? (
                    <span className="lead-star" title="Coordina el equipo" role="img" aria-label="Coordina el equipo">
                      <Icon name="star" size={15} />
                    </span>
                  ) : null}
                  <span className="roster-name">{member.name}</span>
                </div>
                <div className="roster-role">
                  <span>{member.role || 'Sin rol definido'}</span>
                  <span className="area-pill">
                    <span className="dot" style={{ background: AREA_COLORS[member.area] || member.color }} />
                    {member.area || 'Sin área'}
                  </span>
                </div>
                <div className="roster-contact">
                  {member.phone ? (
                    <a className="phone-link" href={`tel:${member.phone.replace(/\s/g, '')}`}>
                      <Icon name="phone" size={14} /> {member.phone}
                    </a>
                  ) : (
                    <span className="muted small">Sin teléfono</span>
                  )}
                </div>
                <div className="roster-load">
                  <span className={`wall-load ${workload.open === 0 ? 'is-free' : ''}`}>{workload.open === 0 ? 'libre' : workload.open}</span>
                  <span className="muted small">
                    {workload.open === 0 ? '' : workload.open === 1 ? 'abierta · ' : 'abiertas · '}
                    {workload.done} {workload.done === 1 ? 'hecha' : 'hechas'}
                  </span>
                </div>
                <div className="roster-tools">
                  <IconButton icon="pencil" label={`Editar a ${member.name}`} onClick={() => setEditing(member)} />
                  <IconButton icon="trash" label={`Retirar a ${member.name}`} onClick={() => void remove(member)} />
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {editing ? <MemberEditor member={editing === 'nuevo' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  )
}

function MemberEditor({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const { mutate } = useStore()
  const [name, setName] = useState(member?.name ?? '')
  const [role, setRole] = useState(member?.role ?? '')
  const [area, setArea] = useState(member?.area ?? AREAS[0])
  const [phone, setPhone] = useState(member?.phone ?? '')
  const [email, setEmail] = useState(member?.email ?? '')
  const [color, setColor] = useState(member?.color ?? COLOR_OPTIONS[0])
  const [isLead, setIsLead] = useState(Boolean(member?.is_lead))
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    const payload = { name: name.trim(), role, area, phone, email, color, is_lead: isLead ? 1 : 0 }
    const ok = await mutate(
      () => (member ? api.updateMember(member.id, payload) : api.createMember(payload)),
      member ? 'Integrante actualizado' : 'Integrante agregado',
    )
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={member ? 'Editar integrante' : 'Nuevo integrante'}
      description="Un rol claro evita que dos personas hagan lo mismo o que algo quede sin dueño."
      footer={
        <>
          <span className="spacer" />
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={saving || !name.trim()}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Nombre">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre y apellido" autoFocus />
        </Field>
        <Field label="Rol o responsabilidad">
          <Input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Ej. Compras: mercado" />
        </Field>
        <div className="form-row">
          <Field label="Área">
            <Select value={area} onChange={(event) => setArea(event.target.value)}>
              {AREAS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Teléfono">
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="999 999 999" />
          </Field>
        </div>
        <Field label="Correo">
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@correo.com" />
        </Field>
        <Field label="Color en el equipo">
          <div className="swatches">
            {COLOR_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`swatch ${color === option ? 'is-selected' : ''}`}
                style={{ background: option }}
                onClick={() => setColor(option)}
                aria-label={`Color ${option}`}
              />
            ))}
          </div>
        </Field>
        <label className="switch-row">
          <input type="checkbox" checked={isLead} onChange={(event) => setIsLead(event.target.checked)} />
          <span>Coordina al equipo</span>
        </label>
      </div>
    </Modal>
  )
}
