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
