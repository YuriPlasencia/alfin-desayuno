import { useState } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import type { ChecklistItem, Task } from '../types'
import { summarize } from '../lib/stats'

/**
 * Marca o desmarca un paso. Al marcar el primero, la actividad pasa a "En curso";
 * al marcar el último, salta a "Hecho" (como mover el imán de columna).
 */
export function useStepToggle() {
  const { data, mutate, toast } = useStore()

  return async (task: Task, item: ChecklistItem) => {
    const done = !item.done
    const remaining = task.checklist.filter((step) => !step.done && step.id !== item.id).length
    const finishes = done && remaining === 0 && task.status !== 'hecha'
    const starts = done && task.status === 'pendiente' && !finishes

    const ok = await mutate(async () => {
      await api.updateChecklistItem(item.id, { done })
      if (finishes) await api.updateTask(task.id, { status: 'hecha' })
      else if (starts) await api.updateTask(task.id, { status: 'en_curso' })
    })
    if (!ok || !data) return

    if (finishes) {
      const before = summarize(data)
      const gained = (1 - taskShare(task)) / Math.max(1, before.total)
      const pct = Math.min(100, Math.round((before.overall + gained) * 100))
      toast(`¡“${task.title}” pasó a Hecho! El equipo ya va ${pct}%`, 'win')
    } else if (starts) {
      toast(`“${task.title}” pasó a En curso`)
    }
  }
}

/** Parte de la actividad que ya estaba avanzada antes del último paso. */
function taskShare(task: Task): number {
  return task.checklist_total === 0 ? 0 : task.checklist_done / task.checklist_total
}

export function StepToggle({ task, item, showTask = false }: { task: Task; item: ChecklistItem; showTask?: boolean }) {
  const toggle = useStepToggle()
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const checked = optimistic ?? Boolean(item.done)

  const onClick = async () => {
    setOptimistic(!checked)
    await toggle(task, item)
    setOptimistic(null)
  }

  return (
    <button className={`step ${checked ? 'is-done' : ''}`} aria-pressed={checked} onClick={() => void onClick()}>
      <span className="step-box" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M5 12.5 10 17.5 19.5 6.5" />
        </svg>
      </span>
      <span className="step-text">
        <span className="step-label">{item.title}</span>
        {showTask ? <span className="step-task">{task.title}</span> : null}
      </span>
    </button>
  )
}
