import { useState } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import type { Member, Task } from '../types'
import { AREA_COLORS } from '../types'
import { Button, Magnet } from './ui'
import { plural } from '../lib/format'

const PRIORITY_RANK = { alta: 0, media: 1, baja: 2 } as const

/** Actividades abiertas donde la persona aún no está, primero las que más necesitan manos. */
export function helpCandidates(tasks: Task[], memberId: number): Task[] {
  return tasks
    .filter((task) => task.status !== 'hecha' && !task.assignees.includes(memberId))
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        a.assignees.length - b.assignees.length ||
        (a.due_date || '9999').localeCompare(b.due_date || '9999'),
    )
}

/** Para quien no tiene tareas: elige en qué actividad sumarse. */
export function HelpPicker({ actor, tasks, members }: { actor: Member; tasks: Task[]; members: Member[] }) {
  const { mutate, toast } = useStore()
  const [showAll, setShowAll] = useState(false)
  const [joining, setJoining] = useState<number | null>(null)
  const candidates = helpCandidates(tasks, actor.id)
  if (candidates.length === 0) return null
  const shown = showAll ? candidates : candidates.slice(0, 4)

  const join = async (task: Task) => {
    setJoining(task.id)
    const ok = await mutate(() => api.updateTask(task.id, { member_ids: [...task.assignees, actor.id] }))
    setJoining(null)
    if (ok) toast(`¡Te sumaste a “${task.title}”! Ya tienes tus pasos aquí arriba.`, 'win')
  }

  return (
    <div className="help">
      <ul className="help-list">
        {shown.map((task) => {
          const owners = members.filter((member) => task.assignees.includes(member.id))
          const pending = task.checklist_total - task.checklist_done
          return (
            <li key={task.id}>
              <div className="help-main">
                <p className="help-title">
                  <span className="dot" style={{ background: AREA_COLORS[task.area] || '#64748B' }} />
                  {task.title}
                </p>
                <div className="help-meta">
                  {owners.length === 0 ? (
                    <span className="help-alone">Nadie a cargo todavía</span>
                  ) : (
                    owners.map((owner) => <Magnet key={owner.id} member={owner} />)
                  )}
                  <span className="muted small">
                    {task.area}
                    {task.checklist_total > 0 ? ` · ${plural(pending, 'paso pendiente', 'pasos pendientes')}` : ''}
                  </span>
                </div>
              </div>
              <Button size="sm" icon="plus" disabled={joining !== null} onClick={() => void join(task)}>
                {joining === task.id ? 'Sumándote…' : 'Me sumo'}
              </Button>
            </li>
          )
        })}
      </ul>
      {candidates.length > 4 ? (
        <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Ver menos' : `Ver las ${candidates.length} actividades`}
        </Button>
      ) : null}
    </div>
  )
}
