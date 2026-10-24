import type { AgreementStatus, Priority, TaskStatus } from '../types'

const dateFmt = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short' })
const longFmt = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const moneyFmt = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 })

export function money(value: number): string {
  return moneyFmt.format(Number.isFinite(value) ? value : 0)
}

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day, 12, 0, 0)
}

export function formatDate(value: string | null | undefined): string {
  const date = parseDate(value)
  return date ? dateFmt.format(date) : 'Sin fecha'
}

export function formatLongDate(value: string | null | undefined): string {
  const date = parseDate(value)
  if (!date) return 'Fecha por definir'
  const formatted = longFmt.format(date)
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

export function daysUntil(value: string | null | undefined): number | null {
  const date = parseDate(value)
  if (!date) return null
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  return Math.round((date.getTime() - today.getTime()) / 86400000)
}

export function deadlineLabel(value: string | null | undefined): { text: string; tone: 'ok' | 'soon' | 'late' | 'muted' } {
  const days = daysUntil(value)
  if (days === null) return { text: 'Sin fecha', tone: 'muted' }
  if (days < 0) return { text: `Venció hace ${Math.abs(days)} d`, tone: 'late' }
  if (days === 0) return { text: 'Vence hoy', tone: 'soon' }
  if (days === 1) return { text: 'Vence mañana', tone: 'soon' }
  if (days <= 7) return { text: `En ${days} días`, tone: 'soon' }
  return { text: `En ${days} días`, tone: 'ok' }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.round(hours / 24)
  if (days < 7) return `hace ${days} d`
  return dateFmt.format(new Date(then))
}

export const TASK_STATUS_META: Record<TaskStatus, { label: string; tone: string }> = {
  pendiente: { label: 'Pendiente', tone: 'neutral' },
  en_curso: { label: 'En curso', tone: 'info' },
  bloqueada: { label: 'Bloqueada', tone: 'danger' },
  hecha: { label: 'Terminada', tone: 'success' },
}

export const PRIORITY_META: Record<Priority, { label: string; tone: string }> = {
  alta: { label: 'Alta', tone: 'danger' },
  media: { label: 'Media', tone: 'warning' },
  baja: { label: 'Baja', tone: 'neutral' },
}

export const AGREEMENT_STATUS_META: Record<AgreementStatus, { label: string; tone: string }> = {
  propuesto: { label: 'Propuesto', tone: 'warning' },
  acordado: { label: 'Acordado', tone: 'info' },
  cumplido: { label: 'Cumplido', tone: 'success' },
}

export function plural(count: number, singular: string, pluralWord: string): string {
  return `${count} ${count === 1 ? singular : pluralWord}`
}

export function getTreasurer<T extends { id: number; name: string; role: string; area: string; phone: string }>(
  settings: { treasurer_id?: number | null } | null | undefined,
  members: T[],
): T | null {
  if (!members || members.length === 0) return null
  if (settings?.treasurer_id) {
    const found = members.find((m) => m.id === settings.treasurer_id)
    if (found) return found
  }
  const finanzas = members.find((m) => m.area === 'Finanzas' || m.role.toLowerCase().includes('tesor'))
  if (finanzas) return finanzas
  return members[0] || null
}

