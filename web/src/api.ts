import type { Bootstrap, EventCategory, EventSummary, EventType, FinDraft, FinEntry, FinKind, FinState, TaskOption, PresenceStats, ScrapedQuote, SecretState, User } from './types'

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

  // La app se mudó de dirección (dominio propio): salta a la nueva en la misma página.
  if (response.status === 421) {
    const body = (await response.json().catch(() => ({}))) as { moved?: string }
    if (body.moved && /^https:\/\//.test(body.moved)) {
      window.location.replace(body.moved + window.location.pathname + window.location.search + window.location.hash)
    }
    throw new ApiError('La app se mudó a otra dirección', 421)
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

const secretPost = (path: string, body: unknown = {}) => request<SecretState>(eventPath(`/secreto${path}`), json(body))

/** Amigo secreto: cada llamada devuelve el juego tal como lo ve quien pregunta. */
export const secreto = {
  get: () => request<SecretState>(eventPath('/secreto')),
  save: (body: Record<string, unknown>) => request<SecretState>(eventPath('/secreto'), { method: 'PUT', body: JSON.stringify(body) }),
  cancel: () => request<SecretState>(eventPath('/secreto'), { method: 'DELETE' }),
  join: () => secretPost('/join'),
  leave: (memberId?: number) => secretPost('/leave', { member_id: memberId }),
  addWish: (body: { title: string; link?: string; price?: number; photo_url?: string }) => secretPost('/wishes', body),
  wishPhoto: (id: number) => request<{ photo_url: string }>(eventPath(`/secreto/wishes/${id}/photo`)),
  removeWish: (id: number) => request<SecretState>(eventPath(`/secreto/wishes/${id}`), { method: 'DELETE' }),
  setExclusions: (pairs: [number, number][]) =>
    request<SecretState>(eventPath('/secreto/exclusions'), { method: 'PUT', body: JSON.stringify({ pairs }) }),
  draw: () => secretPost('/draw'),
  reopen: () => secretPost('/reopen'),
  seen: () => secretPost('/seen'),
  gift: (ready: boolean) => secretPost('/gift', { ready }),
  guess: (memberId: number | null) => secretPost('/guess', { member_id: memberId }),
  message: (to: 'receiver' | 'giver', body: string, kind: 'mensaje' | 'endulzada' = 'mensaje') => secretPost('/messages', { to, body, kind }),
  read: (thread: 'receiver' | 'giver') => secretPost('/read', { thread }),
  reveal: () => secretPost('/reveal'),
}




/** Finanzas personales de la cuenta: ingresos, gastos e inversiones. */
export const finanzas = {
  list: (month: string) => request<FinState>(`/api/finanzas?mes=${encodeURIComponent(month)}`),
  create: (body: Partial<FinEntry> & { kind: FinKind; source?: string }) => request<{ id: number }>('/api/finanzas/entries', json(body)),
  update: (id: number, body: Partial<FinEntry>) => request<{ ok: boolean }>(`/api/finanzas/entries/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: number) => request<{ ok: boolean }>(`/api/finanzas/entries/${id}`, { method: 'DELETE' }),
  doc: (id: number) => request<{ mime: string; data: string }>(`/api/finanzas/docs/${id}`),
  /** Lee una boleta: devuelve un borrador para revisar (no guarda el movimiento). */
  scan: (body: { kind: 'ingreso' | 'gasto'; file: string; text?: string; image?: string }) =>
    request<{ doc_id: number; source: 'ocr' | 'ia' | 'manual'; warning: string; draft: FinDraft | null }>('/api/finanzas/scan', json(body)),
}

/** Juntay: cuentas y eventos (fuera de un evento). */
export const platform = {
  config: () => request<{ googleClientId: string; nameLogin: boolean; emailVerify: boolean }>('/api/config'),
  /** Manda un código de 6 dígitos y un enlace al correo. */
  startEmail: (name: string, email: string, news: boolean, next: string) =>
    request<{ ok: boolean }>('/api/auth/email/start', json({ name, email, news, next })),
  /** Entra con el código (y el correo) o con el enlace del correo. */
  verifyEmail: (body: { email?: string; code?: string; token?: string }) =>
    request<{ user: User; next: string }>('/api/auth/email/verify', json(body)),
  me: () => request<{ user: User | null; events: EventSummary[] }>('/api/me'),
  loginGoogle: (credential: string) => request<{ user: User }>('/api/auth/google', json({ credential })),
  loginName: (name: string, email: string, news: boolean) => request<{ user: User }>('/api/auth/name', json({ name, email, news })),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  createEvent: (body: { name: string; date: string; time: string; location: string; guests: number; code: string; type: EventType; category: EventCategory }) =>
    request<{ slug: string }>('/api/events', json(body)),
  publicEvent: (slug: string) => request<EventSummary>(`/api/events/${encodeURIComponent(slug)}/public`),
  join: (slug: string, code: string) => request<{ ok: boolean }>(`/api/events/${encodeURIComponent(slug)}/join`, json({ code })),
}
