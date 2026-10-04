import { Timer } from 'lucide-react'

import { m } from '#/paraglide/messages'

import { clock, WARN_SECONDS } from '../model/attempt'

/** The server-driven countdown (B-ATT-14): "mm:ss", in warning ink for the last five minutes. */
export function AttemptTimer({ seconds }: { seconds: number }) {
  const tone = seconds <= WARN_SECONDS ? 'text-warning' : 'text-foreground'
  return (
    <p className={`flex items-center gap-1 text-sm font-medium tabular-nums ${tone}`}>
      <Timer aria-hidden className="size-4" />
      <span className="sr-only">{m.attempt_time_left()}</span>
      <time dateTime={`PT${seconds}S`}>{clock(seconds)}</time>
    </p>
  )
}
