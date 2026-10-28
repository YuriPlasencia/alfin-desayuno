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
import { api, ApiError, eventPath, setEventSlug, type GateReason } from './api'
import type { Bootstrap, Member } from './types'

const LAST_EVENT_KEY = 'juntada.lastEvent'

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
  slug: string
  /** Qué falta para entrar: sesión, código del evento, elegir imán (o el evento no existe). */
  gate: GateReason | 'claim' | null
  /** La cuenta queda ligada a un imán del evento (null = crear uno con su nombre). */
  claim: (memberId: number | null) => Promise<string | null>
  actor: Member | null
  setActor: (member: Member | null) => void
  isAdmin: boolean
  refresh: () => Promise<void>
  mutate: (action: () => Promise<unknown>, okMessage?: string) => Promise<boolean>
  toast: (message: string, kind?: ToastKind) => void
  /** Momento de la visita anterior de este dispositivo (para "desde tu última visita"). */
  lastVisit: string | null
  toasts: Toast[]
  dismissToast: (id: number) => void
}

const StoreContext = createContext<StoreValue | null>(null)

function readCache(key: string): Bootstrap | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Bootstrap) : null
  } catch {
    return null
  }
}

let toastSeq = 1

export function AppProvider({ slug, children }: { slug: string; children: ReactNode }) {
  // Cada evento guarda su propia copia para usar sin señal.
  const CACHE_KEY = `juntada.cache.${slug}`
  const VISIT_KEY = `juntada.lastVisit.${slug}`
  useState(() => {
    setEventSlug(slug)
    try {
      localStorage.setItem(LAST_EVENT_KEY, slug)
    } catch {
      /* sin almacenamiento */
    }
    return slug
  })
  const [data, setData] = useState<Bootstrap | null>(() => readCache(`juntada.cache.${slug}`))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [live, setLive] = useState(false)
  const [gate, setGate] = useState<GateReason | 'claim' | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const pending = useRef<number | null>(null)
  // Último contador de cambios visto: si el servidor va por otro, faltan cambios.
  const seenSeq = useRef<number | null>(null)
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
      if (typeof next.seq === 'number') seenSeq.current = next.seq
      setGate(next.me && !next.me.member_id ? 'claim' : null)
      setData(next)
      setOffline(false)
      setError(null)
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(next))
      } catch {
        /* almacenamiento lleno */
      }
    } catch (err) {
      if (err instanceof ApiError && err.reason) {
        setGate(err.reason)
        return
      }
      const message = err instanceof Error ? err.message : 'No se pudo cargar la información'
      setError(message)
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [CACHE_KEY])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const claim = useCallback(
    async (memberId: number | null) => {
      try {
        await api.claim(memberId)
        await refresh()
        return null
      } catch (err) {
        return err instanceof Error ? err.message : 'No se pudo completar'
      }
    },
    [refresh],
  )

  // Conexión en vivo. El navegador abandona un EventSource para siempre si el servidor
  // responde con error (p. ej. durante un despliegue) y el celular lo corta en segundo
  // plano: por eso se reconecta a mano y se resincroniza al volver.
  useEffect(() => {
    if (gate && gate !== 'claim') return
    let source: EventSource | null = null
    let retry: number | undefined
    let attempt = 0
    let opened = false
    let disposed = false
    let lastMessage = Date.now()

    const connect = () => {
      if (disposed) return
      source?.close()
      const current = new EventSource(eventPath('/stream'))
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
        lastMessage = Date.now()
        let payload: { type?: string; seq?: number } = {}
        try {
          payload = JSON.parse((event as MessageEvent).data)
        } catch {
          /* mensaje no JSON */
        }
        if (payload.type === 'hello' || payload.type === 'ping') {
          setLive(true)
          // Latido con un contador distinto: hubo cambios que no llegaron.
          if (typeof payload.seq !== 'number' || payload.seq === seenSeq.current) return
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

    // Un proxy puede dejar la conexión abierta pero muda: si no llega ni el latido
    // (cada 25 s) en más de un minuto, se reconecta y se recarga.
    const watchdog = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || Date.now() - lastMessage < 65000) return
      lastMessage = Date.now()
      setLive(false)
      attempt = 0
      window.clearTimeout(retry)
      connect()
      void refresh()
    }, 15000)

    connect()
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    window.addEventListener('focus', wake)
    return () => {
      disposed = true
      window.clearTimeout(retry)
      window.clearInterval(watchdog)
      if (pending.current) window.clearTimeout(pending.current)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
      window.removeEventListener('focus', wake)
      source?.close()
    }
  }, [refresh, gate])

  // Mientras se muestra "sin conexión", se reintenta solo cada pocos segundos.
  useEffect(() => {
    if (!offline || gate) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 8000)
    return () => window.clearInterval(timer)
  }, [offline, gate, refresh])

  const mutate = useCallback(
    async (action: () => Promise<unknown>, okMessage?: string) => {
      try {
        await action()
        await refresh()
        if (okMessage) toast(okMessage)
        return true
      } catch (err) {
        if (err instanceof ApiError && err.reason) setGate(err.reason)
        const message =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'No se pudo guardar el cambio'
        toast(message, 'error')
        return false
      }
    },
    [refresh, toast],
  )

  // Tu imán es el que tu cuenta tiene ligado en este evento.
  const actor = useMemo(() => {
    const id = data?.me?.member_id
    if (!data || !id) return null
    return data.members.find((member) => member.id === id) || null
  }, [data])

  const setActor = useCallback(
    (member: Member | null) => {
      void claim(member ? member.id : null)
    },
    [claim],
  )

  const value = useMemo<StoreValue>(
    () => ({
      slug,
      data,
      loading,
      error,
      offline,
      live,
      gate,
      claim,
      actor,
      setActor,
      isAdmin: data?.me?.role === 'admin',
      refresh,
      mutate,
      toast,
      lastVisit,
      toasts,
      dismissToast,
    }),
    [slug, data, loading, error, offline, live, gate, claim, actor, setActor, refresh, mutate, toast, lastVisit, toasts, dismissToast],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore debe usarse dentro de AppProvider')
  return store
}
