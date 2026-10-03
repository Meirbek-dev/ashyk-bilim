import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useIdempotencyKey } from '#/shared/api/idempotency'
import type { CourseId, StudentSubmission } from '#/shared/api/gen/types.gen'

import { submitOutcome } from '../model/attempt'
import { patchOf } from '../model/queue'
import { startOptions, submissionOptions, submitOptions } from '../queries'
import { clearQueue, queueOf } from './draft-store'

/**
 * Hand-in (B-ATT-16, B-ATT-17): the queue's unacknowledged answers ride along as the last patch, under one
 * `Idempotency-Key` that survives a lost reply. The answer is the graded attempt: it replaces the cached one and the
 * page shows the result. A 409 on a draft that is still open means the test changed under it: the draft is reopened
 * on the new version (the queue keeps the answers) and the learner checks them and hands in again.
 */
export function useSubmitAttempt(attempt: StudentSubmission, courseId: CourseId) {
  const queryClient = useQueryClient()
  const submit = useMutation(submitOptions(courseId, attempt.assessment_id))
  const reopen = useMutation(startOptions(courseId, attempt.assessment_id))
  const idempotency = useIdempotencyKey()
  const [changed, setChanged] = useState(false)
  const key = submissionOptions(attempt.id).queryKey

  // A 409 or 403: was it handed in meanwhile (the timer sweep, another tab)? Then the page shows the result.
  async function reread(reopenDraft: boolean) {
    const fresh = await queryClient.fetchQuery({ ...submissionOptions(attempt.id), staleTime: 0 }).catch(() => null)
    if (fresh?.status !== 'draft' || !reopenDraft) return
    const reopened = await reopen.mutateAsync({ path: { assessment_id: attempt.assessment_id } }).catch(() => null)
    if (!reopened) return
    queryClient.setQueryData(key, reopened)
    setChanged(true)
  }

  const handIn = (onDone?: () => void) => {
    const batch = queueOf(attempt.id)
    setChanged(false)
    submit.mutate(
      {
        path: { submission_id: attempt.id },
        body: { answers: patchOf(batch) },
        headers: { 'Idempotency-Key': idempotency.key },
      },
      {
        onSuccess: fresh => {
          idempotency.settle()
          clearQueue(attempt.id)
          queryClient.setQueryData(key, fresh)
          onDone?.()
        },
        onError: error => {
          idempotency.settle(error)
          const outcome = submitOutcome(error)
          if (outcome === 'reread' || outcome === 'closed') void reread(outcome === 'reread')
        },
      },
    )
  }
  return { handIn, pending: submit.isPending || reopen.isPending, error: submit.error, changed }
}
