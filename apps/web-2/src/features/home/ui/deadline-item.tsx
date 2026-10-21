import { m } from '#/paraglide/messages'
import type { AgendaDeadline } from '#/shared/api/gen/types.gen'
import { ActivityIcon } from '#/shared/components/activity-icon'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDateTime } from '#/shared/i18n/format'
import { activityType, activityTypeMeta } from '#/shared/i18n/labels'

import { hoursLeft, timeOf } from '../model/agenda'
import { progressStates } from './labels'
import { PlayerLink } from './player-link'

/** One deadline: activity type, state, the title into the player, course and time (and the late cutoff). */
export function DeadlineItem({ deadline, nowUnix }: { deadline: AgendaDeadline; nowUnix: number }) {
  const soon = hoursLeft(deadline, nowUnix)
  const type = activityType(deadline.activity_type)
  const state = progressStates[deadline.state]
  const due = m.home_due_time({ time: timeOf(deadline.due_at_unix) })
  const cutoff = deadline.cutoff_at_unix ? m.home_cutoff({ date: formatDateTime(deadline.cutoff_at_unix) }) : null
  return (
    <div className="flex items-start gap-3">
      <ActivityIcon type={type} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {activityTypeMeta[type].label()}
          <StatusBadge tone={state.tone}>{state.label()}</StatusBadge>
          {/* Within 48 h and not handed in: the time left, in the warning tone (DESIGN 3). */}
          {soon === null ? null : <StatusBadge tone="warning">{m.home_hours_left({ hours: soon })}</StatusBadge>}
        </div>
        <PlayerLink courseId={deadline.course_id} activityId={deadline.activity_id}>
          {deadline.activity_name}
        </PlayerLink>
        <p className="text-sm wrap-anywhere text-muted-foreground">
          {deadline.course_name} · {due}
          {cutoff ? `, ${cutoff}` : null}
        </p>
      </div>
    </div>
  )
}
