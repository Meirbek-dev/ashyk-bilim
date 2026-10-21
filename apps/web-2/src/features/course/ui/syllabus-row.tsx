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

/** One activity on the chapter's seam: type icon on the thread, title (the row is the link), type, done mark. */
export function SyllabusRow({ courseId, activity }: { courseId: CourseId; activity: SyllabusActivity }) {
  const type = activityType(activity.type)
  const work = inFlight(activity)
  return (
    <li className={`relative border-l-2 py-0.5 ${activity.complete ? 'border-primary' : 'border-dashed border-input'}`}>
      {/* py-1.5: a one-line row keeps its height; wrapped titles on a phone no longer run into the next one. */}
      <div
        className={`-ml-4 flex min-h-row items-center gap-3 rounded-lg py-1.5 pr-3 ${activity.available ? 'transition-colors duration-150 hover:bg-accent hover:text-accent-foreground' : ''}`}
      >
        <span className="rounded-lg bg-background">
          <ActivityIcon type={type} size="sm" />
        </span>
        <span className="min-w-0 flex-1 wrap-anywhere">
          {activity.available ? (
            <Link variant="stretched" to="/learn/$courseId/$activityId" params={{ courseId, activityId: activity.id }}>
              {activity.title}
            </Link>
          ) : (
            activity.title
          )}
        </span>
        {activity.opensAt ? (
          <span className="text-sm text-muted-foreground">
            {m.course_activity_opens({ date: formatDateTime(activity.opensAt) })}
          </span>
        ) : null}
        {work ? (
          <span className={`text-sm ${inFlightLabels[work].className}`}>{inFlightLabels[work].label()}</span>
        ) : null}
        <span className="hidden text-sm text-muted-foreground @lg:inline">{activityTypeMeta[type].label()}</span>
        <span className="grid size-5 shrink-0 place-items-center">
          {activity.complete ? (
            <>
              <Check aria-hidden className="size-5 text-success" />
              <span className="sr-only">{m.course_activity_done()}</span>
            </>
          ) : null}
        </span>
      </div>
    </li>
  )
}
