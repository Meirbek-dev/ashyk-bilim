import { isApiError } from '@/lib/api/assertSuccess'
import { DisabledReason } from '@/lib/api/generated/zod'

/**
 * The `DisabledReason` a start/retry 403 names in its problem+json `detail`
 * («cannot start: REMEDIATION_REQUIRED») — the server's attempt-state moved
 * under the open page (a teacher assigned a gate, the last attempt was spent),
 * so the caller refetches it instead of toasting «no permission» (BUG-158).
 */
export function disabledReasonOf(error: unknown): DisabledReason | null {
  if (!isApiError(error) || error.status !== 403) return null
  const detail = error.envelope?.detail ?? error.message
  return DisabledReason.options.find(reason => detail.includes(reason)) ?? null
}
