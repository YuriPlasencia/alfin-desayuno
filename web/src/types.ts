export type TaskStatus = 'pendiente' | 'en_curso' | 'bloqueada' | 'hecha'
export type Priority = 'alta' | 'media' | 'baja'
export type AgreementStatus = 'propuesto' | 'acordado' | 'cumplido'
export type BudgetKind = 'ingreso' | 'gasto'
export type BudgetStatus = 'pendiente' | 'hecho'

export interface Member {
  id: number
  name: string
  role: string
  area: string
  phone: string
  email: string
  color: string
  is_lead: number
  /** Foto de perfil (data URL), vacía si no tiene. */
  photo_url?: string
  position: number
  created_at: string
}

export interface ChecklistItem {
  id: number
  task_id: number
  title: string
  done: number
  position: number
  done_by: number | null
  done_at: string | null
  done_by_name?: string | null
}

export interface TaskOption {
  id: number
  task_id: number
  title: string
  detail: string
  price: number
  image_url: string
  created_by: number | null
  created_by_name: string
  is_winner: number
  created_at: string
  votes: number[]
  vote_count: number
}

export interface Task {
  id: number
  title: string
  detail: string
  area: string
  status: TaskStatus
  priority: Priority
  due_date: string | null
  position: number
  created_at: string
  updated_at: string
  assignees: number[]
  checklist: ChecklistItem[]
  checklist_total: number
  checklist_done: number
  options?: TaskOption[]
}

export interface Agreement {
  id: number
  title: string
  detail: string
  status: AgreementStatus
  owner_id: number | null
  owner_name?: string | null
  due_date: string | null
  created_at: string
  updated_at: string
}

export interface BudgetItem {
  id: number
  kind: BudgetKind
  concept: string
  amount: number
  status: BudgetStatus
  owner_id: number | null
  owner_name?: string | null
  due_date: string | null
  note: string
  /** Solo llega al pedir la constancia o en el respaldo; en el refresco viene has_receipt. */
  receipt_url?: string
  has_receipt?: number
  /** 'cuota' para el aporte de un integrante. */
  category?: string
  validated_by?: number | null
  validated_by_name?: string | null
  validated_at?: string | null
  created_at: string
}


export interface LogEntry {
  id: number
  actor_id: number | null
  actor_name: string
  entity: string
  entity_id: number | null
  action: string
  detail: string
  created_at: string
}

export interface EventSettings {
  id: number
  event_name: string
  event_date: string
  event_time: string
  location: string
  guests: number
  team_size: number
  note: string
  treasurer_id?: number | null
  updated_at: string
}

export interface Bootstrap {
  settings: EventSettings
  members: Member[]
  tasks: Task[]
  agreements: Agreement[]
  budget: BudgetItem[]
  log: LogEntry[]
  serverTime: string
}

export const AREAS = [
  'Coordinación',
  'Finanzas',
  'Compras',
  'Cocina',
  'Logística',
  'Ambientación',
  'Servicio',
  'Comunicación',
  'Regalos',
  'Dinámicas',
] as const

export const AREA_COLORS: Record<string, string> = {
  Coordinación: '#E4572E',
  Finanzas: '#2F8F5B',
  Compras: '#D98E04',
  Cocina: '#C2412D',
  Logística: '#3B6EA5',
  Ambientación: '#8B5CF6',
  Servicio: '#0E7490',
  Comunicación: '#A16207',
  Regalos: '#DB2777',
  Dinámicas: '#1D3FBF',
}

export interface PresenceMember {
  id: number
  name: string
  color: string
  role: string
  is_lead: number
  is_online: boolean
  last_seen_at: string | null
  device: string
  total_visits: number
  last_view: string
  actions_count: number
}

export interface RecentPageView {
  id: number
  member_id: number | null
  member_name: string
  view_name: string
  device: string
  created_at: string
}

export interface PresenceStats {
  summary: {
    total: number
    online: number
    active_today: number
    never: number
  }
  members: PresenceMember[]
  recent_views: RecentPageView[]
}

export interface ScrapedQuote {
  ok: boolean
  detectedAmount: number | null
  detectedConcept: string
  allPrices: number[]
  rawText: string
  error?: string
  wallet?: string
  operationCode?: string
  paidAt?: string
}


