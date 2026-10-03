import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { useIdempotencyKey } from '#/shared/api/idempotency'
import { toast } from '#/shared/ui/toast'

import type { CodeAnswer } from '../model/arena'
import { runCodeOptions, submitOptions } from '../queries'
import { ARENA_PATH } from './arena-route'

type ActionIds = { courseId: string; assessmentId: string; itemId: string; draftId: string }

/**
 * "Run" (B-COD-07) and "Submit" (B-COD-10) of the open attempt, each under its own `Idempotency-Key` that survives a
 * lost answer. A run lands in `?run=`; a hand-in carries the code itself and opens its result (`?submission=`).
 */
export function useAttemptActions({ courseId, assessmentId, itemId, draftId }: ActionIds) {
  const queryClient = useQueryClient()
  const navigate = useNavigate({ from: ARENA_PATH })
  const run = useMutation(runCodeOptions(queryClient))
  const submit = useMutation(submitOptions(queryClient, courseId, assessmentId))
  const runKey = useIdempotencyKey()
  const submitKey = useIdempotencyKey()

  const runCode = ({ language, source }: CodeAnswer) =>
    run.mutate(
      {
        path: { item_id: itemId },
        body: { language_id: language, source },
        headers: { 'Idempotency-Key': runKey.key },
      },
      {
        onSuccess: result => {
          runKey.settle()
          void navigate({ search: previous => ({ ...previous, run: result.id }), replace: true })
        },
        onError: error => runKey.settle(error),
      },
    )
  const handIn = (answer: CodeAnswer) =>
    submit.mutate(
      {
        path: { submission_id: draftId },
        body: { answers: { [itemId]: { kind: 'code', ...answer } } },
        headers: { 'Idempotency-Key': submitKey.key },
      },
      {
        onSuccess: sent => {
          submitKey.settle()
          toast.add({ title: m.code_submitted() })
          void navigate({ search: { submission: sent.id } })
        },
        onError: error => submitKey.settle(error),
      },
    )
  return {
    runCode,
    handIn,
    running: run.isPending,
    submitting: submit.isPending,
    error: run.error ?? submit.error,
  }
}
