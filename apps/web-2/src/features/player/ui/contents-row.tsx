import { AlarmClock, Check, CircleX, Clock, Lock, PenLine, RotateCcw, type LucideIcon } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { ActivityState, CourseId, WorkState } from '#/shared/api/gen/types.gen'
import { ActivityIcon } from '#/shared/components/activity-icon'
import { Link } from '#/shared/components/link'
import { formatDateTime } from '#/shared/i18n/format'
import { activityTypeMeta } from '#/shared/i18n/labels'

type RowProps = {
  courseId: CourseId
  activity: ActivityState
  onPick: () => void
  /** When the learner state was read: untouched work past its due date is marked. */
  nowUnix: number
}

// Work in flight beside the title (B-PLY-20): started and not handed in (an exam's clock may be running), waiting for
// a grade, returned, failed; an icon with its name for readers.
const flight: Partial<Record<WorkState, { icon: LucideIcon; className: string; label: () => string }>> = {
  in_progress: { icon: PenLine, className: 'text-info', label: m.player_state_in_progress },
  submitted: { icon: Clock, className: 'text-muted-foreground', label: m.player_state_submitted },
  needs_grading: { icon: Clock, className: 'text-muted-foreground', label: m.player_state_needs_grading },
  graded_hidden: { icon: Clock, className: 'text-muted-foreground', label: m.player_state_graded_hidden },
  returned: { icon: RotateCcw, className: 'text-warning', label: m.player_state_returned },
  failed: { icon: CircleX, className: 'text-destructive', label: m.player_state_failed },
}

// A name of two lines keeps its type icon and its mark on the first one, not floating at mid-height.
const ROW = 'flex items-start gap-3'
const MARK = 'mt-0.5'

/** One activity of the contents: type tile, title, the server's mark; a restricted one is not a link. */
export function ContentsRow({ courseId, activity, onPick, nowUnix }: RowProps) {
  // Untouched work past the learner's due date (B-PLY-20): the one the course page's «Далее» may jump to.
  const overdue =
    activity.state === 'not_started' && activity.due_at_unix !== null && activity.due_at_unix <= nowUnix
      ? { icon: AlarmClock, className: 'text-warning', label: m.player_late }
      : undefined
  const work = activity.complete ? undefined : (flight[activity.state] ?? overdue)
  const label = (
    <>
      <ActivityIcon type={activity.kind} size="sm" />
      <span className="sr-only">{activityTypeMeta[activity.kind].label()}: </span>
      {/* Two lines at most (real names run to four): the full name is the tooltip. */}
      <span title={activity.title} className="line-clamp-2 min-w-0 flex-1 wrap-anywhere">
        {activity.title}
      </span>
    </>
  )
  if (activity.blocked_reason)
    return (
      <span
        className={`${ROW} min-h-control px-3 py-1.5 text-sm text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0`}
      >
        {label}
        <Lock aria-hidden className={MARK} />
        <span className="sr-only">
          {activity.opens_at_unix
            ? m.player_opens_at({ date: formatDateTime(activity.opens_at_unix) })
            : m.player_locked()}
        </span>
      </span>
    )
  return (
    <Link
      to="/learn/$courseId/$activityId"
      params={{ courseId, activityId: activity.id }}
      variant="contents"
      onClick={onPick}
    >
      <span className={`${ROW} min-w-0 flex-1`}>
        {label}
        {activity.complete ? (
          <>
            <Check aria-hidden className={`${MARK} text-success`} />
            <span className="sr-only">{m.player_done()}</span>
          </>
        ) : work ? (
          <>
            <work.icon aria-hidden className={`${MARK} ${work.className}`} />
            <span className="sr-only">{work.label()}</span>
          </>
        ) : null}
      </span>
    </Link>
  )
}
