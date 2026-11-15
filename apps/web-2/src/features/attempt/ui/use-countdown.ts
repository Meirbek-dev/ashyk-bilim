import { useDebouncer } from '@tanstack/react-pacer'
import { useEffect, useState } from 'react'

import { secondsLeft } from '../model/attempt'

/**
 * Seconds left on a timed draft, from the server only: `time_remaining_seconds` as of the moment that answer arrived
 * (the query's `dataUpdatedAt`), so every save and reread re-syncs the clock. Only the time elapsed on this tab since
 * that answer counts, never the absolute client clock: a skewed clock cancels out (no server offset needed). `null` when the attempt is untimed. The
 * face ticks once a second through a Pacer debouncer that re-arms after each tick, not after unrelated renders. A tick
 * re-arms by its own time (`now`), not by the number shown: after a save re-synced the clock, the tick already pending
 * lands a fraction of a second later on the same number, and a clock re-armed only by a new number stopped for good
 * (no hand-in at zero).
 */
export function useCountdown(remaining: number | null, receivedAtMs: number): number | null {
  const [now, setNow] = useState(() => Date.now())
  const tick = useDebouncer(() => setNow(Date.now()), { wait: 1000 })
  const left = remaining === null ? null : secondsLeft(remaining, receivedAtMs, now)
  useEffect(() => {
    if (left) tick.maybeExecute()
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `now` is the tick itself: it re-arms the next one
  }, [now, left, tick])
  return left
}
