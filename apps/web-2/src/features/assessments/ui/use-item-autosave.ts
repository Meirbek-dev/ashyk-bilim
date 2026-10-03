import { useDebouncer } from '@tanstack/react-pacer'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { use, useRef } from 'react'

import { SaveStatusContext } from '#/features/course-studio'
import type { UpdateItemRequest } from '#/shared/api/gen/types.gen'

import { updateItemOptions } from '../queries'
import { useVersion } from './use-version'

/** Typing settles this long before a question is saved. */
const SAVE_WAIT_MS = 800

/**
 * Autosave of one question (`PATCH /assessment-items/{id}` with `If-Match` = the assessment `version`). One request
 * at a time: edits made while one is in flight go in the next; a refusal keeps the edit for the next change, a 412
 * opens the conflict dialog (`retry` reloads and sends the kept edit). The studio's top bar shows the state; leaving
 * the question (unmount) sends what still waits for the pause.
 */
export function useItemAutosave(activityId: string, assessmentId: string, itemId: string) {
  const report = use(SaveStatusContext)
  const save = useMutation(updateItemOptions(useQueryClient(), activityId, assessmentId))
  const version = useVersion(activityId)
  const unsaved = useRef<UpdateItemRequest | null>(null)
  const sending = useRef(false)

  function send() {
    const body = unsaved.current
    if (!body || sending.current) return
    unsaved.current = null
    sending.current = true
    report(activityId, 'saving')
    save.mutate(
      { path: { item_id: itemId }, body, headers: version.headers() },
      {
        onSuccess: () => {
          sending.current = false
          if (unsaved.current) send()
          else report(activityId, 'saved')
        },
        onError: error => {
          version.onError(error)
          sending.current = false
          unsaved.current ??= body
          report(activityId, 'failed')
        },
      },
    )
  }
  const later = useDebouncer(send, { wait: SAVE_WAIT_MS, onUnmount: debouncer => debouncer.flush() })
  return {
    /** A valid edit: saved after the pause. */
    change: (body: UpdateItemRequest) => {
      unsaved.current = body
      report(activityId, 'dirty')
      later.maybeExecute()
    },
    /** An edit the schema refused: nothing is sent, the bar says there are unsaved changes. */
    invalid: () => report(activityId, 'dirty'),
    error: save.error,
    conflict: {
      open: version.conflict,
      onOpenChange: version.setConflict,
      onRetry: () => void version.reload().then(send),
      pending: save.isPending,
    },
  }
}
