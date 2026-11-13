import { Check } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { ActivityIcon } from '#/shared/components/activity-icon'
import { Link } from '#/shared/components/link'
import { formatDateTime } from '#/shared/i18n/format'
import { activityType, activityTypeMeta } from '#/shared/i18n/labels'

import { inFlight, type InFlight, type SyllabusActivity } from '../model/course'

// The learner's work in flight, named on the row (B-CRS-18); a failed test or returned work asks to come back.
const inFlightLabels = {
  in_progress: { label: m.player_state_in_progress, className: 'text-muted-foreground' },
  submitted: { label: m.player_state_submitted, className: 'text-muted-foreground' },
  needs_grading: { label: m.player_state_needs_grading, className: 'text-muted-foreground' },
  graded_hidden: { label: m.player_state_graded_hidden, className: 'text-muted-foreground' },
  returned: { label: m.player_state_returned, className: 'text-warning' },
  failed: { label: m.player_state_failed, className: 'text-destructive' },
} satisfies Record<InFlight, { label: () => string; className: string }>

/**
 * One activity of a chapter: type icon (in the chapter number's column, so titles share the chapter title's edge),
 * title (the row is the link) with its dates and the learner's work under it, then the type and the done mark at the
 * row's end. Icon, type and mark stand on the title's first line however long the title runs.
 */
export function SyllabusRow({
  courseId,
  activity,
  marks,
}: {
  courseId: CourseId
  activity: SyllabusActivity
  /** The programme tracks completion (a learner's): every row keeps room for the done mark, so types line up. */
  marks: boolean
}) {
  const type = activityType(activity.type)
  const work = inFlight(activity)
  return (
    <li className="relative">
      <div
        className={`-mx-3 flex min-h-11 items-start gap-3 rounded-md px-3 py-2 ${activity.available ? 'transition-colors duration-150 hover:bg-accent/60' : ''}`}
      >
        <span className="flex h-lh w-7 shrink-0 items-center">
          <ActivityIcon type={type} size="sm" />
        </span>
        {/* Below @2xl there is no leader: the title takes the row, so the done mark stays at its end. */}
        <span className="flex min-w-0 flex-1 flex-col wrap-anywhere @2xl:max-w-[70%] @2xl:flex-none">
          {activity.available ? (
            <Link variant="stretched" to="/learn/$courseId/$activityId" params={{ courseId, activityId: activity.id }}>
              {activity.title}
            </Link>
          ) : (
            activity.title
          )}
          {/* The learner's deadline under the title (B-CRS-21): a phone row has no room beside it. */}
          {activity.due ? (
            <span className={`text-sm ${activity.due.past ? 'text-warning' : 'text-muted-foreground'}`}>
              {(activity.due.past ? m.course_activity_overdue : m.course_activity_due)({
                date: formatDateTime(activity.due.at),
              })}
            </span>
          ) : null}
          {activity.opensAt ? (
            <span className="text-sm text-muted-foreground">
              {m.course_activity_opens({ date: formatDateTime(activity.opensAt) })}
            </span>
          ) : null}
          {work ? (
            <span className={`text-sm ${inFlightLabels[work].className}`}>{inFlightLabels[work].label()}</span>
          ) : null}
        </span>
        <span className="flex h-lh shrink-0 items-center gap-3 @2xl:flex-1">
          <span aria-hidden className="hidden h-px flex-1 border-b border-dotted border-input @2xl:block" />
          <span className="hidden text-sm text-muted-foreground @lg:inline">{activityTypeMeta[type].label()}</span>
          {marks || activity.complete ? (
            <span className="grid size-5 shrink-0 place-items-center">
              {activity.complete ? (
                <>
                  <Check aria-hidden className="size-5 text-success" />
                  <span className="sr-only">{m.course_activity_done()}</span>
                </>
              ) : null}
            </span>
          ) : null}
        </span>
      </div>
    </li>
  )
}
