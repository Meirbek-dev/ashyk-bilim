import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { FileSubmission } from '#/shared/api/gen/types.gen'
import { useIdempotencyKey } from '#/shared/api/idempotency'
import { toast } from '#/shared/ui/toast'

import { changedFiles, openAttempt, versionHeader, type WorkAction } from '../model/task'
import { draftOptions, startOptions, submitOptions, taskOptions, type WorkIds } from '../queries'

const isStale = (error: unknown) => error instanceof ApiError && error.status === 412
// A deadline, a gate or a closed task refuses the write (403 / 409): the reasons come with a fresh read (B-FSB-09).
const isRefused = (error: unknown) => error instanceof ApiError && (error.status === 403 || error.status === 409)

/**
 * The learner's writes on the open attempt: file changes (`PATCH .../draft`), the submit and a new attempt. Each
 * action is built from the task in the cache at send time (an upload takes a while: BUG-335), and a 412 keeps the
 * action for "Reload and retry" on the fresh draft (B-FSB-12).
 */
export function useWork(ids: WorkIds) {
  const queryClient = useQueryClient()
  const task = useSuspenseQuery(taskOptions(ids.activityId))
  const draft = useMutation(draftOptions(queryClient, ids))
  const send = useMutation(submitOptions(queryClient, ids))
  const start = useMutation(startOptions(queryClient, ids))
  const idempotency = useIdempotencyKey()
  const [conflict, setConflict] = useState<WorkAction | null>(null)

  const onError = (action: WorkAction) => (error: unknown) => {
    if (isStale(error)) setConflict(action)
    else if (isRefused(error)) void task.refetch()
  }

  const cached = () => queryClient.getQueryData(taskOptions(ids.activityId).queryKey) ?? null

  function run(action: WorkAction, current: FileSubmission | null = cached()) {
    if (!current) return
    for (const mutation of [draft, send, start]) mutation.reset()
    const path = { file_submission_id: current.id }
    if (action.kind === 'files') {
      const body = { files: changedFiles(openAttempt(current), action.change) }
      const done = 'add' in action.change ? m.submission_file_attached() : m.submission_file_removed()
      draft.mutate(
        { path, body, headers: versionHeader(current) },
        { onSuccess: () => toast.add({ title: done }), onError: onError(action) },
      )
    } else if (action.kind === 'submit') {
      send.mutate(
        { path, body: {}, headers: { ...versionHeader(current), 'Idempotency-Key': idempotency.key } },
        {
          onSuccess: () => {
            idempotency.settle()
            toast.add({ title: m.submission_submitted() })
          },
          onError: error => {
            idempotency.settle(error)
            onError(action)(error)
          },
        },
      )
    } else {
      start.mutate(
        { path },
        { onSuccess: () => toast.add({ title: m.submission_attempt_started() }), onError: onError(action) },
      )
    }
  }

  async function retry() {
    const action = conflict
    const fresh = await task.refetch()
    setConflict(null)
    if (action && fresh.data) run(action, fresh.data)
  }

  const failed = [draft.error, send.error, start.error].find(error => error && !isStale(error))
  return {
    run,
    retry,
    conflict: conflict !== null,
    closeConflict: () => setConflict(null),
    pending: draft.isPending || send.isPending || start.isPending,
    submitting: send.isPending,
    error: failed ?? null,
  }
}
