import { CalendarClock, Timer } from 'lucide-react'

import { m } from '#/paraglide/messages'

import { clock, DAY_SECONDS, WARN_SECONDS } from '../model/attempt'

type AttemptTimerProps = {
  seconds: number
  /** The countdown runs to a strict due date, not the time limit. */
  due: boolean
}

/**
 * The server-driven countdown (B-ATT-14): "mm:ss" ("N d h:mm:ss" from a day up), in warning ink for the last five
 * minutes. A countdown to the due date has its own icon and name.
 */
export function AttemptTimer({ seconds, due }: AttemptTimerProps) {
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
