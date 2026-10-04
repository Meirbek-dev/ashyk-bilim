import { useState } from 'react'

import { ApiError } from './errors'

/**
 * Spec 7.6: one `Idempotency-Key` per logical action (a create, a sign-up). The key survives resubmits of a request
 * that got no answer (network), so the server replays instead of creating twice; once the server has answered
 * (success, or an ApiError) the action is over and the next submit gets a new key.
 */
export function useIdempotencyKey(): { key: string; settle: (error?: unknown) => void } {
  const [key, setKey] = useState(() => crypto.randomUUID())
  const settle = (error?: unknown) => {
    if (error === undefined || error instanceof ApiError) setKey(crypto.randomUUID())
  }
  return { key, settle }
}
