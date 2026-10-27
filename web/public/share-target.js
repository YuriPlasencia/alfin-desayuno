/* Recibe imágenes del menú Compartir del celular (Yape, Plin, banco, galería).
   Las guarda en caché y abre Presupuesto, que las toma y pregunta si es cuota o gasto. */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname !== '/compartir') return
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData()
        const file = form.getAll('constancia').find((value) => value && typeof value === 'object')
        if (file) {
          const cache = await caches.open('alfin-compartido')
          await cache.put(
            '/compartido/constancia',
            new Response(file, { headers: { 'Content-Type': file.type || 'image/jpeg', 'X-Nombre': encodeURIComponent(file.name || 'constancia.jpg') } }),
          )
        }
      } catch (error) {
        console.error('[compartir]', error)
      }
      return Response.redirect('/?compartido=1#/presupuesto', 303)
    })(),
  )
})
