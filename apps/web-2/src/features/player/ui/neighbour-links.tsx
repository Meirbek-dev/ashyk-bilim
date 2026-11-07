import { useHotkey } from '@tanstack/react-hotkeys'
import { useNavigate } from '@tanstack/react-router'

import { shortcuts } from '#/features/catalog'
import { m } from '#/paraglide/messages'
import type { ActivityState, CourseId } from '#/shared/api/gen/types.gen'

import { NeighbourTurn } from './neighbour-turn'

type NeighbourProps = {
  courseId: CourseId
  prev: ActivityState | null
  next: ActivityState | null
  /** The primary «Далее: <next>» already leads there: no second link (→ still works). */
  nextShown?: boolean
}

/** Previous and next activity in contents order (← and →), named as a book's running foot; none past either end. */
export function NeighbourLinks({ courseId, prev, next, nextShown = false }: NeighbourProps) {
  const navigate = useNavigate()
  const go = (target: ActivityState | null) => {
    if (target) void navigate({ to: '/learn/$courseId/$activityId', params: { courseId, activityId: target.id } })
  }
  useHotkey(shortcuts.prev.hotkey, () => go(prev))
  useHotkey(shortcuts.next.hotkey, () => go(next))
  return (
    <nav aria-label={m.player_neighbours()} className="grid grid-cols-2 gap-x-6 empty:hidden">
      {prev ? <NeighbourTurn courseId={courseId} target={prev} label={m.player_prev()} /> : null}
      {next && !nextShown ? <NeighbourTurn courseId={courseId} target={next} label={m.player_next()} forward /> : null}
    </nav>
  )
}
