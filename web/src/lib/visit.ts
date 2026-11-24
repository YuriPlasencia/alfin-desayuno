/**
 * Avisa al servidor que se abrió una página (para el panel /admin).
 * Manda la dirección, la página de donde vino y los parámetros utm, nada más.
 * Si falla, no pasa nada: la app sigue igual.
 */
export function trackVisit() {
  try {
    const params = new URLSearchParams(window.location.search)
    const body = JSON.stringify({
      path: window.location.pathname,
      referrer: document.referrer,
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
    })
    void fetch('/api/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' }).catch(() => {})
  } catch {
    /* sin registro de visita */
  }
}
