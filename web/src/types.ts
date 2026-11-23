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
  /** 'plan' = partida del presupuesto inicial; 'real' = ingreso o gasto ejecutado. */
  stage?: 'plan' | 'real'
  /** Partida del presupuesto inicial a la que corresponde un gasto real. */
  plan_id?: number | null
  /** Foto de actividad (cotización) usada como constancia. */
  option_id?: number | null
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
  /** Elegidos al crear el evento ('' en eventos de antes). */
  event_type?: EventType | ''
  event_category?: EventCategory | ''
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
  /** Contador de cambios del servidor (para notar avisos perdidos). */
  seq?: number
  slug?: string
  /** La cuenta que entra: su rol en el evento y qué imán es. */
  me?: {
    user: User
    role: 'admin' | 'member'
    member_id: number | null
    /** Imanes ya ligados a alguna cuenta. */
    claimed: number[]
  }
  /** Amigo secreto: solo el resumen (las parejas nunca viajan aquí). */
  secreto?: SecretSummary | null
}

export type SecretStatus = 'armando' | 'sorteado' | 'revelado'

export interface SecretSummary {
  status: SecretStatus
  title: string
  deliver_date: string
  count: number
  joined: boolean
  /** Mensajes anónimos sin leer. */
  unread: number
  /** Ya hubo sorteo y todavía no abre su papelito. */
  pending: boolean
}

export interface SecretGame {
  status: SecretStatus
  title: string
  budget_min: number
  budget_max: number
  deliver_date: string
  deliver_time: string
  place: string
  rules: string
  /** Endulzadas: detalles anónimos mientras llega el día. */
  sweets: number
  created_by: number | null
  drawn_at: string | null
  revealed_at: string | null
}

export interface SecretWish {
  id: number
  title: string
  link: string
  price: number
  /** La foto se pide aparte con secreto.wishPhoto(id). */
  has_photo: boolean
}

export interface SecretMessage {
  id: number
  mine: boolean
  kind: 'mensaje' | 'endulzada'
  body: string
  created_at: string
}

export interface SecretState {
  game: SecretGame | null
  can_manage: boolean
  participants: { member_id: number; wishes: number; seen: boolean; gift_ready: boolean; guessed: boolean }[]
  exclusions: [number, number][]
  me: {
    member_id: number
    wishes: SecretWish[]
    /** A quién le regalas (solo tú lo recibes). */
    receiver: { member_id: number; wishes: SecretWish[] } | null
    seen: boolean
    gift_ready: boolean
    guess_id: number | null
    to_receiver: SecretMessage[]
    from_giver: SecretMessage[]
    unread_to_receiver: number
    unread_from_giver: number
  } | null
  /** Tu nombre se apuntó desde otra cuenta. */
  locked: boolean
  reveal: { giver_id: number; receiver_id: number }[] | null
  guesses?: { member_id: number; guess_id: number | null }[] | null
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



export interface User {
  id: number
  email: string
  name: string
  picture: string
}

/** Un evento de Juntay, como se ve en "Tus eventos". */
/** Tipo elegido al crear el evento ('' en eventos antiguos). */
export type EventType =
  | 'desayuno'
  | 'almuerzo'
  | 'cena'
  | 'cumpleanos'
  | 'paseo'
  | 'fiesta'
  | 'partido'
  | 'secreto'
  | 'mes'
  | 'viaje'
  | 'ahorro'

/** Para qué se usa el evento. */
export type EventCategory = 'trabajo' | 'familiar' | 'entretenimiento' | 'finanzas'

export interface EventSummary {
  slug: string
  name: string
  date: string
  time: string
  location: string
  type?: EventType | ''
  category?: EventCategory | ''
  role?: 'admin' | 'member'
}
