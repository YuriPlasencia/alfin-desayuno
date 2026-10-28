import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { Icon } from './ui'

const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches
// No todos los navegadores tienen el menú de compartir del sistema (p. ej. Firefox en PC).
const canNativeShare = () => typeof navigator.share === 'function'

/**
 * Botón "Compartir". En el celular abre el menú del teléfono (WhatsApp, Telegram, correo…);
 * en la PC muestra WhatsApp, Telegram y Copiar texto.
 */
export function ShareButton({
  title,
  text,
  label = 'Compartir',
  compact = false,
}: {
  title: string
  /** Texto del mensaje; se le agrega el enlace de la app. */
  text: () => string
  label?: string
  compact?: boolean
}) {
  const { toast } = useStore()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !wrap.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const message = () => `${text()}\n\n👉 ${window.location.origin}`

  const nativeShare = async () => {
    try {
      await navigator.share({ title, text: message() })
      return true
    } catch (err) {
      // Cancelar el menú no es un error.
      return err instanceof DOMException && err.name === 'AbortError'
    }
  }

  const onClick = async () => {
    if (canNativeShare() && isTouchDevice() && (await nativeShare())) return
    setOpen((current) => !current)
  }

  const copy = async () => {
    setOpen(false)
    try {
      await navigator.clipboard.writeText(message())
      toast('Texto copiado: pégalo en tu chat')
    } catch {
      toast('No se pudo copiar el texto', 'error')
    }
  }

  const encoded = () => encodeURIComponent(message())

  return (
    <div className="share" ref={wrap}>
      <button
        type="button"
        className={compact ? 'icon-btn share-trigger' : 'btn btn-outline btn-sm share-trigger'}
        aria-haspopup="menu"
        aria-expanded={open}
        title={compact ? label : undefined}
        aria-label={compact ? label : undefined}
        onClick={() => void onClick()}
      >
        <Icon name="share" size={compact ? 17 : 15} />
        {compact ? null : label}
      </button>
      {open ? (
        <div className="share-menu" role="menu">
          <a
            role="menuitem"
            className="share-item whatsapp"
            href={`https://wa.me/?text=${encoded()}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            <span className="share-dot" /> WhatsApp
          </a>
          <a
            role="menuitem"
            className="share-item telegram"
            href={`https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent(text())}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            <span className="share-dot" /> Telegram
          </a>
          <button role="menuitem" type="button" className="share-item" onClick={() => void copy()}>
            <Icon name="clipboard" size={15} /> Copiar texto
          </button>
          {canNativeShare() ? (
            <button
              role="menuitem"
              type="button"
              className="share-item"
              onClick={() => {
                setOpen(false)
                void nativeShare()
              }}
            >
              <Icon name="share" size={15} /> Más opciones…
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
