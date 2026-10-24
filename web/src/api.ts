import type { Bootstrap } from './types'

const ACTOR_KEY = 'alfin.actor.v1'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const actorId = localStorage.getItem(ACTOR_KEY)
  const headers: Record<string, string> = { ...(init?.body ? { 'Content-Type': 'application/json' } : {}) }
  if (actorId) headers['X-Actor-Id'] = actorId

  let response: Response
  try {
    response = await fetch(path, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string>) } })
  } catch {
    throw new ApiError('No hay conexión con el servidor')
  }

  if (!response.ok) {
    let message = `Error ${response.status}`
    try {
      const body = (await response.json()) as { error?: string }
      if (body?.error) message = body.error
    } catch {
      /* respuesta sin JSON */
    }
    throw new ApiError(message, response.status)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

export const api = {
  getActorId(): number | null {
    const raw = localStorage.getItem(ACTOR_KEY)
    const id = raw ? Number(raw) : NaN
    return Number.isFinite(id) && id > 0 ? id : null
  },
  setActorId(id: number | null) {
    if (id) localStorage.setItem(ACTOR_KEY, String(id))
    else localStorage.removeItem(ACTOR_KEY)
  },
  bootstrap: () => request<Bootstrap>('/api/bootstrap'),
  unlock: (code: string) => request<{ ok: boolean }>('/api/auth', json({ code })),

  createTask: (body: Record<string, unknown>) => request<{ task: Bootstrap['tasks'][number] }>('/api/tasks', json(body)),
  updateTask: (id: number, body: Record<string, unknown>) =>
    request<{ task: Bootstrap['tasks'][number] }>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTask: (id: number) => request<{ ok: boolean }>(`/api/tasks/${id}`, { method: 'DELETE' }),
  addChecklistItem: (taskId: number, title: string) =>
    request<{ item: Bootstrap['tasks'][number]['checklist'][number] }>(`/api/tasks/${taskId}/checklist`, json({ title })),
  updateChecklistItem: (id: number, body: Record<string, unknown>) =>
    request<{ item: Bootstrap['tasks'][number]['checklist'][number] }>(`/api/checklist/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteChecklistItem: (id: number) => request<{ ok: boolean }>(`/api/checklist/${id}`, { method: 'DELETE' }),

  createAgreement: (body: Record<string, unknown>) =>
    request<{ agreement: Bootstrap['agreements'][number] }>('/api/agreements', json(body)),
  updateAgreement: (id: number, body: Record<string, unknown>) =>
    request<{ agreement: Bootstrap['agreements'][number] }>(`/api/agreements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteAgreement: (id: number) => request<{ ok: boolean }>(`/api/agreements/${id}`, { method: 'DELETE' }),

  createMember: (body: Record<string, unknown>) =>
    request<{ member: Bootstrap['members'][number] }>('/api/members', json(body)),
  updateMember: (id: number, body: Record<string, unknown>) =>
    request<{ member: Bootstrap['members'][number] }>(`/api/members/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteMember: (id: number) => request<{ ok: boolean }>(`/api/members/${id}`, { method: 'DELETE' }),

  createBudget: (body: Record<string, unknown>) =>
    request<{ item: Bootstrap['budget'][number] }>('/api/budget', json(body)),
  updateBudget: (id: number, body: Record<string, unknown>) =>
    request<{ item: Bootstrap['budget'][number] }>(`/api/budget/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteBudget: (id: number) => request<{ ok: boolean }>(`/api/budget/${id}`, { method: 'DELETE' }),

  updateSettings: (body: Record<string, unknown>) =>
    request<{ settings: Bootstrap['settings'] }>('/api/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  importData: (data: unknown) => request<Bootstrap>('/api/import', json(data)),
}
