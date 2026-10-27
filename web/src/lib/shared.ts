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
