import { useEffect, useRef, useState } from 'react'
import { fotos } from '../api'
import { compressImageFile } from '../lib/image'
import { sendInboxPhotoToEvent, sendInboxPhotoToFinanzas } from '../lib/shared'
import type { EventSummary, InboxPhoto } from '../types'
import { Button, Icon, Modal } from './ui'

const when = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * Cámara y fotos por ordenar: la persona toma la foto de una boleta o un pago y después
 * decide si va a sus finanzas, a un evento o a los dos.
 */
export function PhotoInbox({ events }: { events: EventSummary[] }) {
  const [photos, setPhotos] = useState<InboxPhoto[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<InboxPhoto | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fotos
      .list()
      .then((result) => setPhotos(result.photos))
      .catch(() => setPhotos([]))
  }, [])

  const add = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      // Comprimida pero legible: después hay que leer las letras chicas de la boleta.
      const image = await compressImageFile(file, 1800, 0.85)
      const { photo } = await fotos.add(image)
      setPhotos((current) => [photo, ...(current || [])])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la foto')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const pending = (photos || []).filter((photo) => !photo.finanzas_at && !photo.event_at).length
  const eventName = (slug: string) => events.find((event) => event.slug === slug)?.name || 'un evento'

  return (
    <section className="photo-inbox" aria-label="Fotos por ordenar">
      <div className="photo-inbox-head">
        <div>
          <h2>Guarda tus boletas con una foto</h2>
          <p className="muted small">
            La del supermercado, el pago de la clínica, una constancia. Tómala ahora y después decides si va a tus finanzas, a un evento o a los dos.
          </p>
        </div>
        {/* capture abre la cámara en el celular; en la computadora, el selector de archivos. */}
        <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void add(e.target.files?.[0])} />
        <Button icon="camera" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Guardando…' : 'Tomar foto'}
        </Button>
      </div>
      {error ? (
        <p className="gate-error" role="alert">
          {error}
        </p>
      ) : null}
      {photos && photos.length ? (
        <>
          <p className="photo-inbox-count small">
            {pending
              ? `${pending} ${pending === 1 ? 'foto por ordenar' : 'fotos por ordenar'}. Toca una para llevarla a su lugar.`
              : 'Todas tus fotos ya tienen destino. Quita las que no necesites.'}
          </p>
          <ul className="photo-grid">
            {photos.map((photo) => (
              <li key={photo.id}>
                <button className="photo-card" onClick={() => setOpen(photo)} aria-label={`Foto del ${when(photo.created_at)}`}>
                  <img src={fotos.image(photo.id)} alt="" loading="lazy" />
                  <span className="photo-card-foot">
                    <span className="small">{when(photo.created_at)}</span>
                    {photo.finanzas_at ? <span className="badge tone-info">En finanzas</span> : null}
                    {photo.event_at ? <span className="badge tone-neutral">En evento</span> : null}
                    {!photo.finanzas_at && !photo.event_at ? <span className="badge tone-warning">Por ordenar</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {open ? (
        <PhotoActions
          photo={open}
          events={events}
          eventName={eventName}
          onClose={() => setOpen(null)}
          onRemoved={() => {
            setPhotos((current) => (current || []).filter((photo) => photo.id !== open.id))
            setOpen(null)
          }}
        />
      ) : null}
    </section>
  )
}

function PhotoActions({
  photo,
  events,
  eventName,
  onClose,
  onRemoved,
}: {
  photo: InboxPhoto
  events: EventSummary[]
  eventName: (slug: string) => string
  onClose: () => void
  onRemoved: () => void
}) {
  const [choosing, setChoosing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar')
      setBusy(false)
    }
  }
  const toEvent = (slug: string) => run(() => sendInboxPhotoToEvent(photo.id, slug))

  return (
    <Modal open onClose={onClose} title="¿A dónde va esta foto?" description={`Tomada el ${when(photo.created_at)}. Puedes llevarla a los dos lugares: se queda aquí hasta que la quites.`}>
      <div className="photo-actions">
        <img src={fotos.image(photo.id)} alt="Foto guardada" />
        {photo.finanzas_at || photo.event_at ? (
          <p className="small muted">
            {[photo.finanzas_at ? `La llevaste a tus finanzas el ${when(photo.finanzas_at)}` : '', photo.event_at ? `La llevaste a ${eventName(photo.event_slug)} el ${when(photo.event_at)}` : '']
              .filter(Boolean)
              .join(' · ')}
            .
          </p>
        ) : null}
        {error ? (
          <p className="gate-error" role="alert">
            {error}
          </p>
        ) : null}
        {choosing ? (
          <div className="photo-events">
            <p className="small muted">Elige el evento:</p>
            {events.map((event) => (
              <Button key={event.slug} variant="outline" disabled={busy} onClick={() => void toEvent(event.slug)}>
                {event.name}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setChoosing(false)}>
              Volver
            </Button>
          </div>
        ) : confirming ? (
          <div className="photo-events">
            <p className="small">Se borra la foto de esta bandeja. Lo que ya guardaste en tus finanzas o en un evento no cambia.</p>
            <Button variant="danger" disabled={busy} onClick={() => void run(() => fotos.remove(photo.id).then(onRemoved))}>
              Sí, quitar la foto
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Volver
            </Button>
          </div>
        ) : (
          <>
            <Button icon="wallet" disabled={busy} onClick={() => sendInboxPhotoToFinanzas(photo.id)}>
              {photo.finanzas_at ? 'Llevar otra vez a mis finanzas' : 'A mis finanzas'}
            </Button>
            {events.length ? (
              <Button variant="soft" icon="users" disabled={busy} onClick={() => (events.length === 1 ? void toEvent(events[0].slug) : setChoosing(true))}>
                {events.length === 1 ? `A ${events[0].name}` : 'A un evento'}
              </Button>
            ) : (
              <p className="small muted">
                <Icon name="info" size={15} /> Para llevarla a un evento, primero crea uno o únete a uno.
              </p>
            )}
            <Button variant="ghost" icon="trash" disabled={busy} onClick={() => setConfirming(true)}>
              Quitar de la bandeja
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}
