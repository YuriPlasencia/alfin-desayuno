import { fotos } from '../api'

const CACHE = 'alfin-compartido'
const KEY = '/compartido/constancia'

/** Si la app se abrió desde el menú Compartir, entrega la imagen recibida (una sola vez). */
export async function takeSharedFile(): Promise<File | null> {
  const params = new URLSearchParams(window.location.search)
  if (!params.has('compartido') || !('caches' in window)) return null
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`)
  try {
    const cache = await caches.open(CACHE)
    const response = await cache.match(KEY)
    if (!response) return null
    await cache.delete(KEY)
    const blob = await response.blob()
    const name = decodeURIComponent(response.headers.get('X-Nombre') || 'constancia.jpg')
    return new File([blob], name, { type: blob.type || 'image/jpeg' })
  } catch {
    return null
  }
}

const INBOX_KEY = 'juntay.fotoParaFinanzas'

async function inboxPhotoFile(id: number): Promise<File> {
  const response = await fetch(fotos.image(id))
  if (!response.ok) throw new Error('Esa foto ya no está en la bandeja')
  const blob = await response.blob()
  return new File([blob], `foto-${id}.jpg`, { type: blob.type || 'image/jpeg' })
}

/**
 * Lleva una foto de la bandeja a un evento: la deja donde Presupuesto recoge las imágenes
 * compartidas y abre el evento, que pregunta si es una cuota o un gasto.
 */
export async function sendInboxPhotoToEvent(id: number, slug: string): Promise<void> {
  if (!('caches' in window)) throw new Error('Este navegador no permite pasar la foto. Súbela desde el evento.')
  const file = await inboxPhotoFile(id)
  const cache = await caches.open(CACHE)
  await cache.put(KEY, new Response(file, { headers: { 'Content-Type': file.type, 'X-Nombre': encodeURIComponent(file.name) } }))
  await fotos.mark(id, { event: slug })
  window.location.href = `/e/${slug}/?compartido=1#/presupuesto`
}

/** Lleva una foto de la bandeja a Mis finanzas, que la lee y abre el gasto para revisar. */
export function sendInboxPhotoToFinanzas(id: number) {
  try {
    sessionStorage.setItem(INBOX_KEY, String(id))
  } catch {
    /* sin almacenamiento: igual se abre Mis finanzas */
  }
  window.location.href = '/finanzas#/gastos'
}

/** La foto de la bandeja pendiente de registrar en Mis finanzas (se entrega una sola vez). */
export async function takeInboxPhotoForFinanzas(): Promise<{ id: number; file: File } | null> {
  let id = 0
  try {
    id = Number(sessionStorage.getItem(INBOX_KEY))
    sessionStorage.removeItem(INBOX_KEY)
  } catch {
    return null
  }
  if (!(id > 0)) return null
  return { id, file: await inboxPhotoFile(id) }
}

const OPTION_KEY = 'alfin.gastoDesdeFoto'

/** Desde una actividad: abre Presupuesto con el gasto armado a partir de esa foto. */
export function sendPhotoToExpenses(optionId: number) {
  try {
    sessionStorage.setItem(OPTION_KEY, String(optionId))
  } catch {
    /* sin almacenamiento: igual se abre Presupuesto */
  }
  window.location.hash = '#/presupuesto'
}

/** La foto de actividad pendiente de registrar como gasto (se entrega una sola vez). */
export function takePhotoForExpense(): number | null {
  try {
    const raw = sessionStorage.getItem(OPTION_KEY)
    sessionStorage.removeItem(OPTION_KEY)
    const id = Number(raw)
    return id > 0 ? id : null
  } catch {
    return null
  }
}
