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
import { TrafficMonitor } from '../components/TrafficMonitor'
import { PhotoField } from '../components/photo'
import { AREAS, AREA_COLORS, type Member } from '../types'
import { summarize } from '../lib/stats'

const COLOR_OPTIONS = ['#E4572E', '#D98E04', '#2F8F5B', '#3B6EA5', '#8B5CF6', '#C2412D', '#0E7490', '#A16207', '#DB2777', '#475569']

export function Team() {
  const { data, actor, mutate, toast } = useStore()
  const [editing, setEditing] = useState<Member | 'nuevo' | null>(null)
  const [viewTab, setViewTab] = useState<'organizadores' | 'invitados' | 'trafico'>('organizadores')



  const summary = useMemo(() => (data ? summarize(data) : null), [data])
  if (!data || !summary) return null

  const sinTareas = data.members.filter((member) => (summary.workload[member.id]?.total ?? 0) === 0)

  const remove = async (member: Member) => {
    if (!window.confirm(`¿Retirar a ${member.name} del equipo? Sus actividades quedarán sin responsable.`)) return
    await mutate(() => api.deleteMember(member.id), 'Integrante retirado')
  }

  const copyRsvpInvite = async () => {
    const text = `🥐 *¡LLEGA EL DESAYUNO DE INTEGRACIÓN ALFIN!*
📅 *Fecha:* ${data.settings.event_date || 'Por confirmar'} · ${data.settings.event_time || '08:30 a.m.'}
📍 *Lugar:* ${data.settings.location || 'Local Comunal'}
👥 *Comensales:* 80 colaboradores de todas las áreas

🥖 *Menú Criollo:*
• Pan con chicharrón caliente con camote frito y salsa criolla
• Tamal criollo de cerdo
• Café pasado de Chanchamayo, jugo de naranja y fruta de estación

⚠️ *¿Tienes alguna dieta especial o restricción médica?*
Contamos con opciones vegetarianas y sin gluten/lactosa. Por favor avisa a Ana Torres o Fiorella Núñez para tener tu plato especial listo.

¡Te esperamos para compartir una gran mañana de equipo!`

    try {
      await navigator.clipboard.writeText(text)
      toast('¡Tarjeta de invitación RSVP copiada! Lista para enviar por Teams o WhatsApp.', 'ok')
    } catch {
      toast('No se pudo copiar la invitación', 'error')
    }
  }

  return (
    <div className="stack">
      <PageHeader
        title="Equipo e Invitados"
        subtitle={`${data.members.length} organizadores a cargo de atender a ${data.settings.guests} compañeros del banco`}
        action={
          viewTab === 'organizadores' ? (
            <Button icon="plus" onClick={() => setEditing('nuevo')}>
              Agregar integrante
            </Button>
          ) : (
            <Button variant="soft" icon="share" onClick={() => void copyRsvpInvite()}>
              Copiar invitación RSVP
            </Button>
          )
        }
      />

      <div className="segmented">
        <button className={viewTab === 'organizadores' ? 'is-active' : ''} onClick={() => setViewTab('organizadores')}>
          Organizadores <span className="seg-count">{data.members.length}</span>
        </button>
        <button className={viewTab === 'invitados' ? 'is-active' : ''} onClick={() => setViewTab('invitados')}>
          Invitados y Menú <span className="seg-count">{data.settings.guests}</span>
        </button>
        <button className={viewTab === 'trafico' ? 'is-active' : ''} onClick={() => setViewTab('trafico')}>
          Tráfico y Presencia <span className="seg-count">🔒 Solo tú</span>
        </button>
      </div>



      {viewTab === 'organizadores' ? (
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
      ) : viewTab === 'invitados' ? (
        <div className="stack">

          {/* Ficha de Preferencias y Dietas */}
          <section className="board" aria-label="Preferencias de Menú">
            <header className="board-head">
              <div>
                <h2 className="board-title">Distribución de Menú y Dietas</h2>
                <p className="board-sub">80 invitados confirmados de las áreas del banco</p>
              </div>
              <div className="countdown" aria-label="80 comensales">
                <strong>80</strong>
                <span>invitados</span>
              </div>
            </header>

            <div className="diet-grid">
              <div className="diet-card primary">
                <div className="diet-icon-wrap">🥐</div>
                <div className="diet-info">
                  <strong>72 Menú Clásico Criollo (90%)</strong>
                  <p className="small muted">
                    Pan con chicharrón de panceta crocante, camote frito, tamal criollo de cerdo y salsa criolla de hierbabuena.
                  </p>
                </div>
              </div>
              <div className="diet-card veg">
                <div className="diet-icon-wrap">🥑</div>
                <div className="diet-info">
                  <strong>5 Menú Vegetariano (6%)</strong>
                  <p className="small muted">
                    Tamal verde de alcachofa y champiñones al ajillo, palta fuerte, camote dorado y salsa criolla.
                  </p>
                </div>
              </div>
              <div className="diet-card alert">
                <div className="diet-icon-wrap">🥛</div>
                <div className="diet-info">
                  <strong>3 Restricciones Médicas (4%)</strong>
                  <p className="small muted">
                    1 Celíaco (estricto sin gluten / plato rotulado) · 2 Intolerancia a la lactosa (café solo o infusión).
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Calculadora Inteligente de Cocina Criolla (Google Smart Portions) */}
          <section className="card">
            <header className="card-head">
              <div>
                <h2>Calculadora Criolla de Insumos</h2>
                <p className="small muted">Cálculo paramétrico para 80 comensales con merma de fritura y margen de seguridad</p>
              </div>
              <span className="lead-star" title="Google Smart Portions">
                <Icon name="sparkles" size={16} />
              </span>
            </header>
            <div className="portions-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Insumo Clave</th>
                    <th>Cantidad Bruta</th>
                    <th>Factor / Merma</th>
                    <th>Porción Servida</th>
                    <th>Estado de Compra</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Panceta de cerdo cruda</strong></td>
                    <td className="tabular font-bold">12.5 kg</td>
                    <td className="muted small">38% merma fritura y grasa</td>
                    <td>~110g por pan (72 porciones)</td>
                    <td><span className="badge-soon">Cotizado en mayorista</span></td>
                  </tr>
                  <tr>
                    <td><strong>Pan francés / ciabatta</strong></td>
                    <td className="tabular font-bold">90 unidades</td>
                    <td className="muted small">+12% holgura (roturas)</td>
                    <td>1 por invitado + 10 de reserva</td>
                    <td><span className="badge-done">Panadería reservada</span></td>
                  </tr>
                  <tr>
                    <td><strong>Tamales criollos (cerdo / pollo)</strong></td>
                    <td className="tabular font-bold">80 unidades</td>
                    <td className="muted small">75 cerdo + 5 verdes</td>
                    <td>1 tamal por comensal</td>
                    <td><span className="badge-soon">Pedido en proceso</span></td>
                  </tr>
                  <tr>
                    <td><strong>Camote amarillo</strong></td>
                    <td className="tabular font-bold">8.0 kg</td>
                    <td className="muted small">15% merma pelado</td>
                    <td>2-3 rodajas por plato</td>
                    <td><span className="badge-soon">Compra sábado 6am</span></td>
                  </tr>
                  <tr>
                    <td><strong>Cebolla morada (salsa criolla)</strong></td>
                    <td className="tabular font-bold">6.0 kg</td>
                    <td className="muted small">Con ají limo y hierbabuena</td>
                    <td>Platillos compartidos</td>
                    <td><span className="badge-soon">Compra sábado 6am</span></td>
                  </tr>
                  <tr>
                    <td><strong>Café pasado Chanchamayo</strong></td>
                    <td className="tabular font-bold">18.0 litros</td>
                    <td className="muted small">2 termos industriales</td>
                    <td>~220ml por taza (con refill)</td>
                    <td><span className="badge-done">Cafeteras listas</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Plan de Integración de Mesas Cruzadas */}
          <section className="card">
            <header className="card-head">
              <div>
                <h2>Plan de Integración: 10 Mesas Cruzadas</h2>
                <p className="small muted">
                  Distribuimos a las áreas del banco en parejas para romper silos y fomentar la camaradería real
                </p>
              </div>
            </header>
            <div className="table-plan-grid">
              {[
                { num: 1, areas: 'Comercial Lima Centro + Riesgos Créditos', icon: '🏦' },
                { num: 2, areas: 'Operaciones & Cajas + Tecnología (TI)', icon: '💻' },
                { num: 3, areas: 'Recuperaciones & Cobranzas + Finanzas', icon: '📊' },
                { num: 4, areas: 'Banca Empresa + Recursos Humanos', icon: '🤝' },
                { num: 5, areas: 'Auditoría + Cumplimiento & Legal', icon: '⚖️' },
                { num: 6, areas: 'Transformación Digital + Agencias Provincia', icon: '🚀' },
                { num: 7, areas: 'Experiencia del Cliente + Marketing', icon: '⭐' },
                { num: 8, areas: 'Planeamiento Estratégico + Ciberseguridad', icon: '🛡️' },
                { num: 9, areas: 'Soporte Operativo + Inteligencia de Negocios', icon: '📈' },
                { num: 10, areas: 'Mesa Mixta de Coordinación y Líderes', icon: '🏆' },
              ].map((m) => (
                <div key={m.num} className="table-plan-card">
                  <div className="table-number">
                    <span>{m.icon}</span>
                    <strong>Mesa {m.num}</strong>
                  </div>
                  <p className="table-areas">{m.areas}</p>
                  <span className="small muted">8 asientos asignados</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <TrafficMonitor />
      )}

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
  const [photo, setPhoto] = useState(member?.photo_url ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    const payload = { name: name.trim(), role, area, phone, email, color, is_lead: isLead ? 1 : 0, photo_url: photo }
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
        <Field label="Foto" hint="Desde la cámara o la galería del celular">
          <PhotoField member={{ name: name || 'Integrante', color }} value={photo} onChange={setPhoto} />
        </Field>
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
