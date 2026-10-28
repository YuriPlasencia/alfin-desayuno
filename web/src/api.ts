import type { Bootstrap, EventSummary, TaskOption, PresenceStats, ScrapedQuote, User } from './types'

/** Por qué el servidor no deja pasar: falta iniciar sesión, unirse al evento o el evento no existe. */
export type GateReason = 'login' | 'join' | 'no-event'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly reason?: GateReason,
  ) {
    super(message)
  }
}

// Evento en curso: todas sus llamadas van a /api/e/<slug>/…
let eventSlug = ''
export function setEventSlug(slug: string) {
  eventSlug = slug
}
export const eventPath = (path: string) => `/api/e/${eventSlug}${path}`

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.body ? { 'Content-Type': 'application/json' } : {}) }

  let response: Response
  try {
    response = await fetch(path, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string>) } })
  } catch {
    throw new ApiError('No hay conexión con el servidor')
  }

  if (!response.ok) {
    let message = `Error ${response.status}`
    let reason: GateReason | undefined
    try {
      const body = (await response.json()) as { error?: string; reason?: GateReason }
      if (body?.error) message = body.error
      reason = body?.reason
    } catch {
      /* respuesta sin JSON */
    }
    throw new ApiError(message, response.status, reason)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

export const api = {
  bootstrap: () => request<Bootstrap>(eventPath('/bootstrap')),
  claim: (memberId: number | null) => request<{ member_id: number }>(eventPath('/claim'), json({ member_id: memberId })),
  changeCode: (code: string) => request<{ ok: boolean }>(eventPath('/code'), { method: 'PATCH', body: JSON.stringify({ code }) }),

  createTask: (body: Record<string, unknown>) => request<{ task: Bootstrap['tasks'][number] }>(eventPath('/tasks'), json(body)),
  updateTask: (id: number, body: Record<string, unknown>) =>
    request<{ task: Bootstrap['tasks'][number] }>(eventPath(`/tasks/${id}`), { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTask: (id: number) => request<{ ok: boolean }>(eventPath(`/tasks/${id}`), { method: 'DELETE' }),
  addChecklistItem: (taskId: number, title: string) =>
    request<{ item: Bootstrap['tasks'][number]['checklist'][number] }>(eventPath(`/tasks/${taskId}/checklist`), json({ title })),
  updateChecklistItem: (id: number, body: Record<string, unknown>) =>
    request<{ item: Bootstrap['tasks'][number]['checklist'][number] }>(eventPath(`/checklist/${id}`), {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteChecklistItem: (id: number) => request<{ ok: boolean }>(eventPath(`/checklist/${id}`), { method: 'DELETE' }),
  createTaskOption: (taskId: number, body: { title: string; detail?: string; price?: number; image_url?: string }) =>
    request<{ option: TaskOption }>(eventPath(`/tasks/${taskId}/options`), json(body)),
  voteTaskOption: (optionId: number) =>
    request<{ ok: boolean; option: TaskOption }>(eventPath(`/options/${optionId}/vote`), { method: 'POST' }),
  setOptionWinner: (optionId: number, isWinner: boolean) =>
    request<{ ok: boolean; option: TaskOption }>(eventPath(`/options/${optionId}/winner`), {
      method: 'PATCH',
      body: JSON.stringify({ is_winner: isWinner ? 1 : 0 }),
    }),
  deleteTaskOption: (optionId: number) => request<{ ok: boolean }>(eventPath(`/options/${optionId}`), { method: 'DELETE' }),

  createAgreement: (body: Record<string, unknown>) =>
    request<{ agreement: Bootstrap['agreements'][number] }>(eventPath('/agreements'), json(body)),
  updateAgreement: (id: number, body: Record<string, unknown>) =>
    request<{ agreement: Bootstrap['agreements'][number] }>(eventPath(`/agreements/${id}`), {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteAgreement: (id: number) => request<{ ok: boolean }>(eventPath(`/agreements/${id}`), { method: 'DELETE' }),

  createMember: (body: Record<string, unknown>) =>
    request<{ member: Bootstrap['members'][number] }>(eventPath('/members'), json(body)),
  updateMember: (id: number, body: Record<string, unknown>) =>
    request<{ member: Bootstrap['members'][number] }>(eventPath(`/members/${id}`), { method: 'PATCH', body: JSON.stringify(body) }),
  deleteMember: (id: number) => request<{ ok: boolean }>(eventPath(`/members/${id}`), { method: 'DELETE' }),

  createBudget: (body: Record<string, unknown>) =>
    request<{ item: Bootstrap['budget'][number] }>(eventPath('/budget'), json(body)),
  updateBudget: (id: number, body: Record<string, unknown>) =>
    request<{ item: Bootstrap['budget'][number] }>(eventPath(`/budget/${id}`), { method: 'PATCH', body: JSON.stringify(body) }),
  deleteBudget: (id: number) => request<{ ok: boolean }>(eventPath(`/budget/${id}`), { method: 'DELETE' }),
  getReceipt: (id: number) => request<{ receipt_url: string }>(eventPath(`/budget/${id}/receipt`)),
  validateBudget: (id: number, validated = true) =>
    request<{ ok: boolean }>(eventPath(`/budget/${id}/validate`), json({ validated })),

  updateSettings: (body: Record<string, unknown>) =>
    request<{ settings: Bootstrap['settings'] }>(eventPath('/settings'), { method: 'PATCH', body: JSON.stringify(body) }),
  importData: (data: unknown) => request<Bootstrap>(eventPath('/import'), json(data)),
  logActivity: (body: { entity?: string; action?: string; detail: string; entityId?: number }) =>
    request<{ ok: boolean }>(eventPath('/activity'), json(body)),
  pingPresence: (view?: string) => request<{ ok: boolean }>(eventPath('/presence'), json({ view })),
  getPresenceStats: () => request<PresenceStats>(eventPath('/presence/stats')),
  scrapeQuoteImage: (image: string) => request<ScrapedQuote>(eventPath('/ocr/scrape'), json({ image })),
}




/** Juntada: cuentas y eventos (fuera de un evento). */
export const platform = {
  config: () => request<{ googleClientId: string; nameLogin: boolean }>('/api/config'),
  me: () => request<{ user: User | null; events: EventSummary[] }>('/api/me'),
  loginGoogle: (credential: string) => request<{ user: User }>('/api/auth/google', json({ credential })),
  loginName: (name: string) => request<{ user: User }>('/api/auth/name', json({ name })),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  createEvent: (body: { name: string; date: string; time: string; location: string; guests: number; code: string }) =>
    request<{ slug: string }>('/api/events', json(body)),
  publicEvent: (slug: string) => request<EventSummary>(`/api/events/${encodeURIComponent(slug)}/public`),
  join: (slug: string, code: string) => request<{ ok: boolean }>(`/api/events/${encodeURIComponent(slug)}/join`, json({ code })),
}
