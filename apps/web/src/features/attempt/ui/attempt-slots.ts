import type { ComponentType } from 'react'

import type { AssessmentId, SubmissionId } from '#/shared/api/gen/types.gen'

/**
 * Typed slots for later slices. `remediation`: the work on the mistakes of the last attempt (slice 6.3, AI), shown on
 * the entry when the server requires it before a new attempt (`REMEDIATION_REQUIRED`). Unset renders nothing.
 */
export const attemptSlots: {
  remediation?: ComponentType<{ assessmentId: AssessmentId; submissionId: SubmissionId | null }>
} = {}
