import { useEffect, useEffectEvent } from 'react'

import { AttemptTimer, useCountdown } from '#/features/attempt'
import type { StudentSubmission } from '#/shared/api/gen/types.gen'

type DraftClockProps = { draft: StudentSubmission; receivedAt: number; onExpire: () => void }

/**
 * The open attempt's clock (B-COD-05): the server's seconds to the time limit or a strict due date, whichever comes
 * first; at zero the code is handed in, as on a quiz. Its own component: the editor does not re-render every second.
 */
export function DraftClock({ draft, receivedAt, onExpire }: DraftClockProps) {
  const left = useCountdown(draft.time_remaining_seconds, receivedAt)
  const expire = useEffectEvent(onExpire)
  useEffect(() => {
    if (left === 0) expire()
  }, [left])
  return left === null ? null : <AttemptTimer seconds={left} attempt={draft} receivedAt={receivedAt} />
}
