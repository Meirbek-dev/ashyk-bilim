import { useHotkey } from '@tanstack/react-hotkeys'
import { useNavigate, Link as RouterLink } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { shortcuts } from '#/features/catalog'
import { m } from '#/paraglide/messages'
import type { ActivityState, CourseId } from '#/shared/api/gen/types.gen'
import { buttonVariants } from '#/shared/ui/button'

type NeighbourProps = { courseId: CourseId; prev: ActivityState | null; next: ActivityState | null }

/** Previous and next activity in contents order (← and →); none past either end. */
export function NeighbourLinks({ courseId, prev, next }: NeighbourProps) {
  const navigate = useNavigate()
  const go = (target: ActivityState | null) => {
    if (target) void navigate({ to: '/learn/$courseId/$activityId', params: { courseId, activityId: target.id } })
  }
  useHotkey(shortcuts.prev.hotkey, () => go(prev))
  useHotkey(shortcuts.next.hotkey, () => go(next))
  return (
    <nav aria-label={m.player_neighbours()} className="flex items-center justify-between gap-2">
      {prev ? (
        <RouterLink
          to="/learn/$courseId/$activityId"
          params={{ courseId, activityId: prev.id }}
          className={buttonVariants({ variant: 'ghost' })}
          aria-label={`${m.player_prev()}: ${prev.title}`}
        >
          <ChevronLeft aria-hidden />
          {m.player_prev()}
        </RouterLink>
      ) : (
        <span />
      )}
      {next ? (
        <RouterLink
          to="/learn/$courseId/$activityId"
          params={{ courseId, activityId: next.id }}
          className={buttonVariants({ variant: 'ghost' })}
          aria-label={`${m.player_next()}: ${next.title}`}
        >
          {m.player_next()}
          <ChevronRight aria-hidden />
        </RouterLink>
      ) : null}
    </nav>
  )
}
