import { useRef, useState } from 'react'
import { useStore } from '../store'
import { api, eventPath } from '../api'
import { Button, Field, Icon, Input, PageHeader, Select, TextArea } from '../components/ui'
import { TrafficMonitor } from '../components/TrafficMonitor'
import { ShareButton } from '../components/share'
import { formatLongDate } from '../lib/format'
import type { Bootstrap } from '../types'


export function Settings() {
  const { data, mutate, toast } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => ({
    event_name: data?.settings.event_name ?? '',
    event_date: data?.settings.event_date ?? '',
    event_time: data?.settings.event_time ?? '',
    location: data?.settings.location ?? '',
    guests: String(data?.settings.guests ?? ''),
    team_size: String(data?.settings.team_size ?? ''),
    note: data?.settings.note ?? '',
    treasurer_id: data?.settings.treasurer_id ? String(data.settings.treasurer_id) : '',
  }))

  if (!data) return null

  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }))

  const save = async () => {
    setSaving(true)
    await mutate(
      () =>
        api.updateSettings({
          ...form,
          guests: Number(form.guests) || data.settings.guests,
          team_size: Number(form.team_size) || data.settings.team_size,
          treasurer_id: form.treasurer_id ? Number(form.treasurer_id) : null,
        }),
      'Datos del evento guardados',
    )
    setSaving(false)
  }

  const onImport = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as Bootstrap
      if (!window.confirm('Esto reemplaza todos los datos actuales con los del archivo. ¿Continuar?')) return
      await mutate(() => api.importData(parsed), 'Copia importada')
    } catch {
      toast('El archivo no es un respaldo válido', 'error')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="stack">
      <PageHeader title="Ajustes" subtitle="Datos del evento, invitación, respaldo y uso en el celular" />

      <section className="card">
        <header className="card-head">
          <div>
            <h2>Tráfico y Conexión del Equipo 🔒</h2>
            <p className="muted small">Supervisa en tiempo real quién ha entrado a la app, desde qué dispositivo y a quién recordarle</p>
          </div>
          <span className="live-pill">
            <span className="live-ping-dot" /> Solo Coordinación
          </span>
        </header>
        <TrafficMonitor />
      </section>

      <section className="card">

        <header className="card-head">
          <div>
            <h2>Datos del evento</h2>
            <p className="muted small">Esto es lo que se muestra en el inicio y en la cabecera</p>
          </div>
        </header>
        <div className="form-grid">
          <div className="form-row">
            <Field label="Nombre del evento">
              <Input value={form.event_name} onChange={(event) => set('event_name')(event.target.value)} />
            </Field>
            <Field label="Fecha">
              <Input type="date" value={form.event_date} onChange={(event) => set('event_date')(event.target.value)} />
            </Field>
            <Field label="Hora">
              <Input type="time" value={form.event_time} onChange={(event) => set('event_time')(event.target.value)} />
            </Field>
          </div>
          <Field label="Lugar">
            <Input value={form.location} onChange={(event) => set('location')(event.target.value)} placeholder="Salón, dirección o referencia" />
          </Field>
          <div className="form-row">
            <Field label="Invitados">
              <Input type="number" min="1" value={form.guests} onChange={(event) => set('guests')(event.target.value)} />
            </Field>
            <Field label="Integrantes del equipo">
              <Input type="number" min="1" value={form.team_size} onChange={(event) => set('team_size')(event.target.value)} />
            </Field>
          </div>
          <Field label="Nota general" hint="Horarios de montaje, indicaciones, etc.">
            <TextArea rows={3} value={form.note} onChange={(event) => set('note')(event.target.value)} />
          </Field>
          <Field label="Tesorero(a) oficial del evento" hint="Recibe los aportes por Yape/Plin y figura en el código QR y reportes oficiales">
            <Select value={form.treasurer_id} onChange={(event) => set('treasurer_id')(event.target.value)}>
              <option value="">Selecciona al integrante</option>
              {data.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} ({member.phone || 'Sin celular'}) — {member.area}
                </option>
              ))}
            </Select>
          </Field>
          <div className="form-actions">
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      </section>

      <InviteCard />

      <section className="card">
        <header className="card-head">
          <div>
            <h2>Respaldo y datos</h2>
            <p className="muted small">Descarga una copia o restaura un respaldo anterior</p>
          </div>
        </header>
        <div className="settings-actions">
          <a className="btn btn-outline btn-md" href={eventPath('/export')}>
            <Icon name="download" size={17} /> Descargar respaldo
          </a>
          <Button variant="outline" icon="upload" onClick={() => fileRef.current?.click()}>
            Importar respaldo
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onImport(file)
            }}
          />
        </div>
        <p className="muted small">
          {data.members.length} integrantes · {data.tasks.length} actividades · {data.agreements.length} acuerdos ·{' '}
          {data.budget.length} movimientos de presupuesto
        </p>
      </section>

      <section className="card">
        <header className="card-head">
          <div>
            <h2>Usar en el celular</h2>
            <p className="muted small">La app es una PWA: se instala desde el navegador, sin tienda de aplicaciones</p>
          </div>
        </header>
        <ol className="steps-list">
          <li>
            <strong>Android:</strong> abre la dirección de la app en Chrome y toca el menú ⋮ → “Instalar aplicación” o
            “Agregar a la pantalla principal”.
          </li>
          <li>
            <strong>iPhone:</strong> abre en Safari → Compartir → “Agregar a inicio”.
          </li>
          <li>
            <strong>Computadora:</strong> en Chrome o Edge aparece el ícono de instalar en la barra de direcciones.
          </li>
          <li>Una vez instalada se abre como app y mantiene el último avance visible aunque no haya señal.</li>
        </ol>
      </section>

      <section className="card info-card">
        <Icon name="lock" />
        <div>
          <p className="mini-title">Quién hizo cada cambio</p>
          <p className="small muted">
            Cada persona elige su nombre en el selector de la cabecera y desde ese momento sus cambios quedan
            registrados en “Actividad reciente”. No hay contraseñas: la app está pensada para la red interna del equipo.
          </p>
        </div>
      </section>

      <p className="muted tiny">
        Juntada · versión {__APP_VERSION__} · compilada{' '}
        {new Date(__BUILT_AT__).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  )
}


/** Invitar al equipo con el enlace del evento; quien organiza puede cambiar el código. */
function InviteCard() {
  const { slug, data, isAdmin, toast } = useStore()
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  if (!data) return null
  const link = `${window.location.origin}/e/${slug}`
  const st = data.settings

  const saveCode = async () => {
    setSaving(true)
    try {
      await api.changeCode(code.trim())
      toast('Código actualizado. Compártelo con el equipo.')
      setCode('')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo cambiar el código', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h2>Invitar al equipo</h2>
          <p className="muted small">Comparte el enlace; al entrar les pedirá el código del evento.</p>
        </div>
      </header>
      <div className="invite-row">
        <code className="invite-link">{link}</code>
        <ShareButton
          title={`Únete a ${st.event_name}`}
          label="Compartir enlace"
          text={() =>
            [
              `🎉 Te invito a organizar *${st.event_name}* en Juntada`,
              st.event_date ? `📅 ${formatLongDate(st.event_date)}${st.event_time ? ` · ${st.event_time}` : ''}` : '',
              'Entra con tu cuenta de Google y escribe el código del evento (pídemelo).',
            ]
              .filter(Boolean)
              .join('\n')
          }
        />
      </div>
      {isAdmin ? (
        <div className="invite-code">
          <Field label="Nuevo código del evento" hint="Quienes ya entraron siguen dentro; el nuevo código sirve para los que faltan.">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Mínimo 4 caracteres" autoComplete="off" />
          </Field>
          <Button variant="outline" onClick={() => void saveCode()} disabled={saving || code.trim().length < 4}>
            {saving ? 'Guardando…' : 'Cambiar código'}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
