import { useDebouncer } from '@tanstack/react-pacer'
import { useEffect, useState } from 'react'

import { secondsLeft } from '../model/attempt'

/**
 * Seconds left on a timed draft, from the server only: `time_remaining_seconds` as of the moment that answer arrived
 * (the query's `dataUpdatedAt`), so every save and reread re-syncs the clock. `null` when the attempt is untimed. The
 * face ticks once a second through a Pacer debouncer that re-arms itself after each render.
 */
export function useCountdown(remaining: number | null, receivedAtMs: number): number | null {
  const [now, setNow] = useState(() => Date.now())
  const tick = useDebouncer(() => setNow(Date.now()), { wait: 1000 })
  const left = remaining === null ? null : secondsLeft(remaining, receivedAtMs, now)
  useEffect(() => {
    if (left) tick.maybeExecute()
  })
  return left
}
