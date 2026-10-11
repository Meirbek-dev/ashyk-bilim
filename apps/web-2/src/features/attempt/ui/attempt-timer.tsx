import { CalendarClock, Timer } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { StudentSubmission } from '#/shared/api/gen/types.gen'
import { formatDateTime } from '#/shared/i18n/format'

import { clock, clockEndsAt, DAY_SECONDS, runsToDueDate, WARN_SECONDS } from '../model/attempt'

type AttemptTimerProps = {
  /** Seconds left now (`useCountdown`). */
  seconds: number
  /** The draft and when it arrived: whether the clock runs to a due date, and when it ends. */
  attempt: Pick<StudentSubmission, 'time_remaining_reason' | 'time_remaining_seconds'>
  receivedAt: number
}

/**
 * The server-driven countdown (B-ATT-14): "mm:ss" ("N d h:mm:ss" from a day up), in warning ink for the last five
 * minutes. A countdown to the due date has its own icon and name and runs only in the last day; before that the
 * attempt reads «Сдать до <date, time>».
 */
export function AttemptTimer({ seconds, attempt, receivedAt }: AttemptTimerProps) {
  const due = runsToDueDate(attempt.time_remaining_reason)
  if (due && seconds > DAY_SECONDS)
    return (
      <p className="flex items-center gap-1 text-sm leading-tight font-medium">
        <CalendarClock aria-hidden className="size-4 shrink-0" />
        {m.attempt_due_by({ date: formatDateTime(clockEndsAt(attempt.time_remaining_seconds ?? 0, receivedAt)) })}
      </p>
    )
  const tone = seconds <= WARN_SECONDS ? 'text-warning' : 'text-foreground'
  const Icon = due ? CalendarClock : Timer
  const label = due ? m.attempt_due_left() : m.attempt_time_left()
  const face =
    seconds >= DAY_SECONDS
      ? m.attempt_days_clock({ days: Math.floor(seconds / DAY_SECONDS), clock: clock(seconds % DAY_SECONDS, true) })
      : clock(seconds)
  return (
    <p className={`flex items-center gap-1 text-sm font-medium tabular-nums ${tone}`} title={label}>
      <Icon aria-hidden className="size-4" />
      <span className="sr-only">{label}</span>
      <time dateTime={`PT${seconds}S`}>{face}</time>
    </p>
  )
}
