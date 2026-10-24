import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api, ApiError } from './api'
import type { Bootstrap, Member } from './types'

const CACHE_KEY = 'alfin.cache.v2'
const VISIT_KEY = 'alfin.lastVisit'

type ToastKind = 'ok' | 'error' | 'win'

interface Toast {
  id: number
  message: string
  kind: ToastKind
}

interface StoreValue {
  data: Bootstrap | null
  loading: boolean
  error: string | null
  offline: boolean
  live: boolean
  /** El servidor pide el código del equipo. */
  locked: boolean
  unlock: (code: string) => Promise<string | null>
  actor: Member | null
  setActor: (member: Member | null) => void
  refresh: () => Promise<void>
  mutate: (action: () => Promise<unknown>, okMessage?: string) => Promise<boolean>
  toast: (message: string, kind?: ToastKind) => void
  /** Momento de la visita anterior de este dispositivo (para "desde tu última visita"). */
  lastVisit: string | null
  toasts: Toast[]
  dismissToast: (id: number) => void
}

const StoreContext = createContext<StoreValue | null>(null)

function readCache(): Bootstrap | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as Bootstrap) : null
  } catch {
    return null
  }
}

let toastSeq = 1

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Bootstrap | null>(() => readCache())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [live, setLive] = useState(false)
  const [locked, setLocked] = useState(false)
  const [actorId, setActorId] = useState<number | null>(() => api.getActorId())
  const [toasts, setToasts] = useState<Toast[]>([])
  const pending = useRef<number | null>(null)
  const [lastVisit] = useState<string | null>(() => {
    try {
      return localStorage.getItem(VISIT_KEY)
    } catch {
      return null
    }
  })

  useEffect(() => {
    const stamp = () => {
      try {
        localStorage.setItem(VISIT_KEY, new Date().toISOString())
      } catch {
        /* almacenamiento no disponible */
      }
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') stamp()
    }
    const timer = window.setTimeout(stamp, 8000)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, kind: ToastKind = 'ok') => {
      const id = toastSeq++
      setToasts((current) => [...current, { id, message, kind }])
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== id))
      }, kind === 'error' ? 6000 : kind === 'win' ? 4200 : 3200)
    },
    [],
  )

  const refresh = useCallback(async () => {
    try {
      const next = await api.bootstrap()
      setData(next)
      setOffline(false)
      setError(null)
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(next))
      } catch {
        /* almacenamiento lleno */
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setLocked(true)
        return
      }
      const message = err instanceof Error ? err.message : 'No se pudo cargar la información'
      setError(message)
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const unlock = useCallback(
    async (code: string) => {
      try {
        await api.unlock(code)
        setLocked(false)
        setLoading(true)
        await refresh()
        return null
      } catch (err) {
        return err instanceof Error ? err.message : 'No se pudo comprobar el código'
      }
    },
    [refresh],
  )

  // Conexión en vivo. El navegador abandona un EventSource para siempre si el servidor
  // responde con error (p. ej. durante un despliegue) y el celular lo corta en segundo
  // plano: por eso se reconecta a mano y se resincroniza al volver.
  useEffect(() => {
    if (locked) return
    let source: EventSource | null = null
    let retry: number | undefined
    let attempt = 0
    let opened = false
    let disposed = false

    const connect = () => {
      if (disposed) return
      source?.close()
      const current = new EventSource('/api/stream')
      source = current
      current.addEventListener('open', () => {
        attempt = 0
        setLive(true)
        // Tras una reconexión pudo haber cambios que no llegaron: se recargan.
        if (opened) void refresh()
        opened = true
      })
      current.addEventListener('error', () => {
        setLive(false)
        if (current.readyState === EventSource.CLOSED) {
          const delay = Math.min(30000, 2000 * 2 ** attempt)
          attempt += 1
          window.clearTimeout(retry)
          retry = window.setTimeout(connect, delay)
        }
      })
      current.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as { type: string }
          if (payload.type === 'hello') {
            setLive(true)
            return
          }
        } catch {
          /* mensaje no JSON */
        }
        if (pending.current) window.clearTimeout(pending.current)
        pending.current = window.setTimeout(() => {
          void refresh()
        }, 220)
      })
    }

    const wake = () => {
      if (document.visibilityState !== 'visible') return
      void refresh()
      if (!source || source.readyState === EventSource.CLOSED) {
        attempt = 0
        window.clearTimeout(retry)
        connect()
      }
    }

    connect()
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    return () => {
      disposed = true
      window.clearTimeout(retry)
      if (pending.current) window.clearTimeout(pending.current)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
      source?.close()
    }
  }, [refresh, locked])

  // Mientras se muestra "sin conexión", se reintenta solo cada pocos segundos.
  useEffect(() => {
    if (!offline || locked) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 8000)
    return () => window.clearInterval(timer)
  }, [offline, locked, refresh])

  const mutate = useCallback(
    async (action: () => Promise<unknown>, okMessage?: string) => {
      try {
        await action()
        await refresh()
        if (okMessage) toast(okMessage)
        return true
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) setLocked(true)
        const message =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'No se pudo guardar el cambio'
        toast(message, 'error')
        return false
      }
    },
    [refresh, toast],
  )

  const setActor = useCallback(
    (member: Member | null) => {
      api.setActorId(member ? member.id : null)
      setActorId(member ? member.id : null)
      if (member) toast(`Listo, ${member.name.split(' ')[0]}: tu imán ya está en la pizarra`)
    },
    [toast],
  )

  const actor = useMemo(() => {
    if (!data || !actorId) return null
    return data.members.find((member) => member.id === actorId) || null
  }, [data, actorId])

  const value = useMemo<StoreValue>(
    () => ({ data, loading, error, offline, live, locked, unlock, actor, setActor, refresh, mutate, toast, lastVisit, toasts, dismissToast }),
    [data, loading, error, offline, live, locked, unlock, actor, setActor, refresh, mutate, toast, lastVisit, toasts, dismissToast],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore debe usarse dentro de AppProvider')
  return store
}
