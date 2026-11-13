import { Link as RouterLink } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'

import type { ActivityState, CourseId } from '#/shared/api/gen/types.gen'

/**
 * One way to turn the page, as the object it leads to: the small word and its arrow are the link, stretched over the
 * whole card with the title it names.
 */
export function NeighbourTurn({
  courseId,
  target,
  label,
  forward = false,
}: {
  courseId: CourseId
  target: ActivityState
  label: string
  forward?: boolean
}) {
  return (
    <div
      className={`group relative flex min-w-0 flex-col gap-1 rounded-lg border px-4 py-3 transition-colors duration-150 hover:bg-accent/60 ${forward ? '@lg:col-start-2' : ''}`}
    >
      <RouterLink
        to="/learn/$courseId/$activityId"
        params={{ courseId, activityId: target.id }}
        aria-label={`${label}: ${target.title}`}
        // Both cards read from their left edge; the arrows stand at the outer ends.
        className={`flex items-center gap-1.5 text-sm text-muted-foreground after:absolute after:inset-0 after:rounded-lg [&_svg]:size-4 ${forward ? 'justify-between' : ''}`}
      >
        {forward ? null : <ArrowLeft aria-hidden />}
        {label}
        {forward ? <ArrowRight aria-hidden /> : null}
      </RouterLink>
      <p aria-hidden title={target.title} className="line-clamp-2 text-base font-medium wrap-anywhere">
        {target.title}
      </p>
    </div>
  )
}
