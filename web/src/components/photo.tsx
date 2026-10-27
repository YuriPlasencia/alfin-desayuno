import { useRef, useState } from 'react'
import { squarePhoto } from '../lib/image'
import type { Member } from '../types'
import { Avatar, Button } from './ui'

/** Selector de foto de perfil: cámara o galería del celular, recortada y comprimida. */
export function PhotoField({
  member,
  value,
  onChange,
}: {
  member: Pick<Member, 'name' | 'color'>
  value: string
  onChange: (next: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      onChange(await squarePhoto(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo usar esa foto')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="photo-field">
      <Avatar member={{ ...member, photo_url: value }} size="lg" />
      <div className="photo-field-actions">
        <Button type="button" variant="outline" size="sm" icon="camera" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Preparando…' : value ? 'Cambiar foto' : 'Subir foto'}
        </Button>
        {value ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')}>
            Quitar
          </Button>
        ) : null}
        {error ? <p className="field-error">{error}</p> : null}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(event) => void pick(event.target.files?.[0])} />
    </div>
  )
}
