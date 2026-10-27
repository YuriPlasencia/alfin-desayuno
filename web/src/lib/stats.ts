import type { BudgetItem, Bootstrap, Task } from '../types'

/** Cuota por integrante (la misma del reporte de WhatsApp y de "Subir cuota"). */
export const CUOTA = 100

/**
 * ¿Es el pago de una cuota? Marcado por "Subir cuota" o, si se cargó con
 * "Movimiento", porque el concepto dice "cuota".
 */
export function isCuota(item: Pick<BudgetItem, 'kind' | 'category' | 'concept' | 'stage'>): boolean {
  if (item.kind !== 'ingreso' || item.stage === 'plan') return false
  return item.category === 'cuota' || /\bcuota/i.test(item.concept)
}

export function taskProgress(task: Task): number {
  if (task.status === 'hecha') return 1
  if (task.checklist_total === 0) return 0
  return task.checklist_done / task.checklist_total
}

export interface AreaSummary {
  area: string
  total: number
  done: number
  progress: number
}

export interface MemberWorkload {
  open: number
  done: number
  total: number
}

export interface Summary {
  total: number
  done: number
  inProgress: number
  blocked: number
  pending: number
  overall: number
  checklistTotal: number
  checklistDone: number
  areas: AreaSummary[]
  agreements: { propuesto: number; acordado: number; cumplido: number; total: number; pendientes: number }
  budget: {
    /** Presupuesto inicial: ingresos previstos (incluye las cuotas de todo el equipo). */
    ingresos: number
    /** Presupuesto inicial: gastos previstos. */
    gastos: number
    saldoPlan: number
    /** Línea automática de cuotas: CUOTA × integrantes. */
    cuotasPlan: number
    /** Ejecución: lo cobrado y lo pagado de verdad. */
    cobrado: number
    pagado: number
    /** Saldo en caja (cobrado − pagado). */
    saldo: number
    avanceCobro: number
    avanceGasto: number
  }
  upcoming: Task[]
  workload: Record<number, MemberWorkload>
  eventsTotal: number
  teamSize: number
}

export function summarize(data: Bootstrap): Summary {
  const tasks = data.tasks
  const total = tasks.length
  const done = tasks.filter((t) => t.status === 'hecha').length
  const inProgress = tasks.filter((t) => t.status === 'en_curso').length
  const blocked = tasks.filter((t) => t.status === 'bloqueada').length
  const pending = tasks.filter((t) => t.status === 'pendiente').length
  const overall = total === 0 ? 0 : tasks.reduce((acc, task) => acc + taskProgress(task), 0) / total

  const checklistTotal = tasks.reduce((acc, task) => acc + task.checklist_total, 0)
  const checklistDone = tasks.reduce((acc, task) => acc + task.checklist_done, 0)

  const areaNames = Array.from(new Set(tasks.map((task) => task.area))).sort()
  const areas: AreaSummary[] = areaNames.map((area) => {
    const areaTasks = tasks.filter((task) => task.area === area)
    const areaDone = areaTasks.filter((task) => task.status === 'hecha').length
    const progress =
      areaTasks.length === 0 ? 0 : areaTasks.reduce((acc, task) => acc + taskProgress(task), 0) / areaTasks.length
    return { area, total: areaTasks.length, done: areaDone, progress }
  })

  const agreements = {
    propuesto: data.agreements.filter((a) => a.status === 'propuesto').length,
    acordado: data.agreements.filter((a) => a.status === 'acordado').length,
    cumplido: data.agreements.filter((a) => a.status === 'cumplido').length,
    total: data.agreements.length,
    pendientes: data.agreements.filter((a) => a.status !== 'cumplido').length,
  }

  const plan = data.budget.filter((b) => b.stage === 'plan')
  const real = data.budget.filter((b) => b.stage !== 'plan')
  const cuotasPlan = CUOTA * data.members.length
  const ingresos = cuotasPlan + plan.filter((b) => b.kind === 'ingreso').reduce((acc, b) => acc + b.amount, 0)
  const gastos = plan.filter((b) => b.kind === 'gasto').reduce((acc, b) => acc + b.amount, 0)
  const cobrado = real.filter((b) => b.kind === 'ingreso' && b.status === 'hecho').reduce((acc, b) => acc + b.amount, 0)
  const pagado = real.filter((b) => b.kind === 'gasto' && b.status === 'hecho').reduce((acc, b) => acc + b.amount, 0)

  const upcoming = tasks
    .filter((task) => task.status !== 'hecha' && task.due_date)
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
    .slice(0, 5)

  const workload: Record<number, MemberWorkload> = {}
  for (const member of data.members) workload[member.id] = { open: 0, done: 0, total: 0 }
  for (const task of tasks) {
    for (const memberId of task.assignees) {
      if (!workload[memberId]) workload[memberId] = { open: 0, done: 0, total: 0 }
      workload[memberId].total += 1
      if (task.status === 'hecha') workload[memberId].done += 1
      else workload[memberId].open += 1
    }
  }

  return {
    total,
    done,
    inProgress,
    blocked,
    pending,
    overall,
    checklistTotal,
    checklistDone,
    areas,
    agreements,
    budget: {
      ingresos,
      gastos,
      saldoPlan: ingresos - gastos,
      cuotasPlan,
      cobrado,
      pagado,
      saldo: cobrado - pagado,
      avanceCobro: ingresos === 0 ? 0 : cobrado / ingresos,
      avanceGasto: gastos === 0 ? 0 : pagado / gastos,
    },
    upcoming,
    workload,
    eventsTotal: data.log.length,
    teamSize: data.members.length,
  }
}

export interface MyStep {
  task: Task
  pending: Task['checklist']
}

/** Actividades abiertas de una persona, primero las que vencen antes. */
export function myPlate(data: Bootstrap, memberId: number | null | undefined): MyStep[] {
  if (!memberId) return []
  return data.tasks
    .filter((task) => task.status !== 'hecha' && task.assignees.includes(memberId))
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
    .map((task) => ({ task, pending: task.checklist.filter((item) => !item.done) }))
}

/** Movimientos de otras personas posteriores a una marca de tiempo. */
export function sinceVisit(data: Bootstrap, since: string | null, actorId: number | null | undefined) {
  if (!since) return { entries: [] as Bootstrap['log'], people: [] as string[] }
  const limit = new Date(since).getTime()
  const entries = data.log.filter(
    (entry) => new Date(entry.created_at).getTime() > limit && entry.actor_id !== null && entry.actor_id !== actorId,
  )
  const people = Array.from(new Set(entries.map((entry) => entry.actor_name.split(' ')[0])))
  return { entries, people }
}

/** Movimientos registrados hoy (hora local). */
export function todayCount(data: Bootstrap): number {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return data.log.filter((entry) => entry.actor_id !== null && new Date(entry.created_at) >= start).length
}
