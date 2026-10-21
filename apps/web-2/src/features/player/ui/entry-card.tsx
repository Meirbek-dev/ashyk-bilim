import { CalendarClock } from 'lucide-react'
import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import type { ActivityState, CourseId, WorkState } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDateTime, formatPercent } from '#/shared/i18n/format'

import { activityKind, type ActivityKind } from '../model/player'

type Tone = 'neutral' | 'success' | 'warning' | 'info' | 'destructive'

const workStates = {
  not_started: { label: m.player_state_not_started, tone: 'neutral' },
  in_progress: { label: m.player_state_in_progress, tone: 'info' },
  submitted: { label: m.player_state_submitted, tone: 'info' },
  needs_grading: { label: m.player_state_needs_grading, tone: 'info' },
  graded_hidden: { label: m.player_state_graded_hidden, tone: 'info' },
  returned: { label: m.player_state_returned, tone: 'warning' },
  passed: { label: m.player_state_passed, tone: 'success' },
  failed: { label: m.player_state_failed, tone: 'destructive' },
  complete: { label: m.player_done, tone: 'success' },
  locked: { label: m.player_state_locked, tone: 'neutral' },
} satisfies Record<WorkState, { label: () => string; tone: Tone }>

// What the work is like, for a learner who has not handed anything in yet.
const hints = {
  attempt: m.player_hint_attempt,
  code: m.player_hint_code,
  submission: m.player_hint_submission,
} satisfies Record<Exclude<ActivityKind, 'lesson'>, () => string>

const fresh = new Set<WorkState>(['not_started', 'in_progress'])
const open = new Set<WorkState>(['not_started', 'in_progress', 'returned'])

/**
 * Graded work's entry (B-PLY-11): the work state, the released grade large, the deadline, a line on how the work goes
 * before anything is handed in; the action sits below it.
 */
export function EntryCard({
  courseId,
  entry,
  action,
  nowUnix,
}: {
  courseId: CourseId
  entry: ActivityState
  action: ReactNode
  /** When the learner state was read: the clock the hours left are counted from. */
  nowUnix: number
}) {
  const status = workStates[entry.state]
  const kind = activityKind(entry.activity_type)
  // Failed with no attempt left (B-PLY-19): the learner is not left at a dead end that «Продолжить» keeps leading to.
  // Due within 48 h and not handed in (B-PLY-21): the hours left in the warning tone, as /home says it.
  const left = entry.due_at_unix === null ? 0 : entry.due_at_unix - nowUnix
  const soon = open.has(entry.state) && left > 0 && left <= 48 * 3600 ? Math.max(1, Math.ceil(left / 3600)) : null
  const outOfAttempts = entry.state === 'failed' && !entry.allowed_actions.includes('start')
  return (
    <div className="flex flex-col items-start gap-4 rounded-xl border bg-card p-gutter text-card-foreground shadow-xs">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge tone={status.tone}>{status.label()}</StatusBadge>
        {entry.is_late ? <StatusBadge tone="warning">{m.player_late()}</StatusBadge> : null}
        {soon === null ? null : <StatusBadge tone="warning">{m.player_hours_left({ hours: soon })}</StatusBadge>}
      </div>
      {typeof entry.score === 'number' ? (
        <p className="font-heading text-xl font-semibold tabular-nums">
          {/* Open work with a grade is a retake: the grade is the last one. */}
          {fresh.has(entry.state) || entry.state === 'returned'
            ? m.player_score_last({ score: formatPercent(entry.score) })
            : m.player_score({ score: formatPercent(entry.score) })}
        </p>
      ) : null}
      {entry.due_at_unix ? (
        <p className="flex items-center gap-2 text-sm">
          <CalendarClock aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          {m.player_due({ date: formatDateTime(entry.due_at_unix) })}
        </p>
      ) : null}
      {kind !== 'lesson' && fresh.has(entry.state) && entry.score === null ? (
        <p className="max-w-prose text-sm text-muted-foreground">{hints[kind]()}</p>
      ) : null}
      {outOfAttempts ? (
        <p className="max-w-prose text-sm text-muted-foreground">
          {m.player_out_of_attempts()}{' '}
          <Link to="/courses/$courseId/discussions" params={{ courseId }}>
            {m.player_ask_teacher()}
          </Link>
        </p>
      ) : null}
      {action}
    </div>
  )
}
