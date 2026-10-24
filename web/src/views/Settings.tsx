import { useRef, useState } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import { Button, Field, Icon, Input, PageHeader, TextArea } from '../components/ui'
import type { Bootstrap } from '../types'

export function Settings() {
  const { data, mutate, refresh, toast } = useStore()
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

  const reset = async () => {
    if (!window.confirm('Se borra todo y se vuelven a cargar los datos de ejemplo. ¿Continuar?')) return
    await mutate(() => api.resetDemo(), 'Datos de ejemplo restablecidos')
    await refresh()
  }

  return (
    <div className="stack">
      <PageHeader title="Ajustes" subtitle="Datos del desayuno, respaldo y uso en el celular" />

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
          <div className="form-actions">
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      </section>

      <section className="card">
        <header className="card-head">
          <div>
            <h2>Respaldo y datos</h2>
            <p className="muted small">Descarga una copia o restaura un respaldo anterior</p>
          </div>
        </header>
        <div className="settings-actions">
          <a className="btn btn-outline btn-md" href="/api/export">
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
          <Button variant="danger" icon="refresh" onClick={() => void reset()}>
            Restablecer datos de ejemplo
          </Button>
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

      <p className="muted tiny">Al Fin Desayuno · versión 0.1.0 · datos guardados en SQLite en el servidor</p>
    </div>
  )
}
