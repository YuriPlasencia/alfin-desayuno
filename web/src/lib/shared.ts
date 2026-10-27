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
