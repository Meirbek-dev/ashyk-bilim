import { useDebouncer } from '@tanstack/react-pacer'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { ApiError } from '#/shared/api/errors'

import type { CodeAnswer } from '../model/arena'
import { attemptsOptions, saveOptions } from '../queries'

/** Typing settles this long before the code is saved; the server takes one save per 5 s per draft. */
const SAVE_WAIT_MS = 5000

export type DraftStatus = 'saved' | 'dirty' | 'saving' | 'failed' | 'conflict'

type DraftIds = { assessmentId: string; itemId: string; draftId: string }

/**
 * The code in the server draft (B-COD-06): saved after a pause, one request at a time, with `If-Match` of the cached
 * draft (each answer replaces it). A refused save keeps the code for the next try; 409 (another tab saved, or the
 * attempt is closed) stops saving until the page is read again. Leaving sends what still waits.
 */
export function useCodeDraft({ assessmentId, itemId, draftId }: DraftIds) {
  const queryClient = useQueryClient()
  const save = useMutation(saveOptions(queryClient, assessmentId))
  const unsaved = useRef<CodeAnswer | null>(null)
  const sending = useRef(false)
  const [status, setStatus] = useState<DraftStatus>('saved')

  const version = () =>
    queryClient.getQueryData(attemptsOptions(assessmentId).queryKey)?.find(row => row.id === draftId)?.draft_version

  // What was typed during a save, or a throttled save, goes after the next pause (the debouncer is made below from
  // `send`, so `send` reaches it through this ref).
  const again = useRef<() => void>(() => undefined)

  function send() {
    const answer = unsaved.current
    const current = version()
    if (!answer || sending.current || current === undefined) return
    unsaved.current = null
    sending.current = true
    setStatus('saving')
    save.mutate(
      {
        path: { submission_id: draftId },
        body: { answers: { [itemId]: { kind: 'code', language: answer.language, source: answer.source } } },
        headers: { 'If-Match': current },
      },
      {
        onSuccess: () => settled(null),
        onError: error => settled(error, answer),
      },
    )
  }

  // After a save: what was typed meanwhile, or a throttled save, goes after the next pause.
  function settled(error: unknown, answer?: CodeAnswer) {
    sending.current = false
    if (answer) unsaved.current ??= answer
    if (error instanceof ApiError && error.status === 409) setStatus('conflict')
    else if (error && !(error instanceof ApiError && error.status === 429)) setStatus('failed')
    else if (unsaved.current) again.current()
    else setStatus('saved')
  }

  const later = useDebouncer(send, { wait: SAVE_WAIT_MS, onUnmount: debouncer => debouncer.flush() })
  useEffect(() => {
    again.current = () => later.maybeExecute()
  }, [later])

  return {
    status,
    change: (answer: CodeAnswer) => {
      unsaved.current = answer
      if (status !== 'conflict') setStatus('dirty')
      later.maybeExecute()
    },
    /** The hand-in carries the code itself: nothing may be saved after it (the attempt is closed then). */
    drop: () => {
      unsaved.current = null
      later.cancel()
    },
  }
}
