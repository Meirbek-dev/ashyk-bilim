import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { useIdempotencyKey } from '#/shared/api/idempotency'
import type { CourseId, StudentSubmission } from '#/shared/api/gen/types.gen'
import { toast } from '#/shared/ui/toast'

import { submitOutcome } from '../model/attempt'
import { patchOf } from '../model/queue'
import { assessmentOptions, startOptions, submissionOptions, submitOptions } from '../queries'
import { ATTEMPT_ROUTE } from './attempt-frame'
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
  const { activityId } = useParams({ from: ATTEMPT_ROUTE })

  // A 409 or 403: was it handed in meanwhile (the timer sweep, another tab)? Then the page shows the result.
  async function reread(reopenDraft: boolean, onClose?: () => void) {
    const fresh = await queryClient.fetchQuery({ ...submissionOptions(attempt.id), staleTime: 0 }).catch(() => null)
    if (fresh?.status !== 'draft' || !reopenDraft) return
    const reopened = await reopen.mutateAsync({ path: { assessment_id: attempt.assessment_id } }).catch(() => null)
    if (!reopened) return
    // The questions as they are now: the learner checks the changed test, not the copy loaded with the page.
    await queryClient.refetchQueries({ queryKey: assessmentOptions(activityId).queryKey })
    queryClient.setQueryData(key, reopened)
    // The page says «Тест изменился»: the confirmation and its stale-data error step aside for it.
    submit.reset()
    setChanged(true)
    onClose?.()
  }

  const handIn = (onClose?: () => void) => {
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
          toast.add({ title: m.attempt_submitted() })
          onClose?.()
        },
        onError: error => {
          idempotency.settle(error)
          const outcome = submitOutcome(error)
          if (outcome === 'reread' || outcome === 'closed') void reread(outcome === 'reread', onClose)
        },
      },
    )
  }
  return { handIn, pending: submit.isPending || reopen.isPending, error: submit.error, changed }
}
