// Antes las claves del navegador empezaban con "juntada." (nombre anterior, Juntada).
// Al abrir la app se pasan a "juntay." con su contenido: el último evento, la copia
// para usar sin señal y la última visita siguen ahí.
const OLD_PREFIX = 'juntada.'
const NEW_PREFIX = 'juntay.'

try {
  const oldKeys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(OLD_PREFIX)) oldKeys.push(key)
  }
  for (const key of oldKeys) {
    const next = NEW_PREFIX + key.slice(OLD_PREFIX.length)
    const value = localStorage.getItem(key)
    if (value !== null && localStorage.getItem(next) === null) localStorage.setItem(next, value)
    localStorage.removeItem(key)
  }
} catch {
  /* sin almacenamiento, o lleno: se queda como estaba */
}

export {}
