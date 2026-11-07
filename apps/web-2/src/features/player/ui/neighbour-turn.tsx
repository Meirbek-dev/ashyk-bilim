import { Link as RouterLink } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'

import type { ActivityState, CourseId } from '#/shared/api/gen/types.gen'

/** One way to turn the page: the small word and its arrow are the link, stretched over the title it names. */
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
      className={`group relative flex min-w-0 flex-col gap-1 rounded-md py-2 ${forward ? 'col-start-2 items-end text-end' : 'items-start'}`}
    >
      <RouterLink
        to="/learn/$courseId/$activityId"
        params={{ courseId, activityId: target.id }}
        aria-label={`${label}: ${target.title}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-150 group-hover:text-foreground after:absolute after:inset-0 [&_svg]:size-4"
      >
        {forward ? null : <ArrowLeft aria-hidden />}
        {label}
        {forward ? <ArrowRight aria-hidden /> : null}
      </RouterLink>
      <p
        aria-hidden
        className="line-clamp-2 max-w-full font-heading text-lg wrap-anywhere underline-offset-4 group-hover:underline"
      >
        {target.title}
      </p>
    </div>
  )
}
