import { useDebouncer, useThrottler } from '@tanstack/react-pacer'
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useSelector } from '@tanstack/react-store'
import { useEffect, useRef, useState } from 'react'

import type { ItemAnswer, StudentSubmission } from '#/shared/api/gen/types.gen'

import { retryDelayMs, SAVE_WINDOW_MS, saveOutcome, saveStatus, type SaveOutcome } from '../model/attempt'
import { ack, enqueue, overlay, patchOf, type Queue } from '../model/queue'
import { saveOptions, submissionOptions } from '../queries'
import { draftStore, loadQueue, queueOf, updateQueue } from './draft-store'
import { useOnline } from './use-online'

const EMPTY: Queue = []

/** Read the attempt again; true while it is still an open draft (otherwise the page turns to its result). */
async function stillDraft(queryClient: QueryClient, attempt: StudentSubmission) {
  const fresh = await queryClient.fetchQuery({ ...submissionOptions(attempt.id), staleTime: 0 }).catch(() => null)
  return fresh?.status === 'draft'
}

/**
 * The one draft mechanism of an attempt (R-08, spec 7.8). An answer goes to the local queue at once (memory and
 * storage); the queue goes to the server draft with `If-Match: draft_version`, one request at a time and at most one
 * per save window. The server's answer replaces the cached attempt and acknowledges exactly the entries it carried.
 * A 409 rereads the attempt: still a draft - the conflict dialog; handed in - the page turns to the result. Nothing
 * local is dropped until the server has it.
 */
export function useAttemptDraft(attempt: StudentSubmission) {
  const id = attempt.id
  loadQueue(id)
  const queryClient = useQueryClient()
  const queue = useSelector(draftStore, state => state[id] ?? EMPTY)
  const online = useOnline()
  const save = useMutation(saveOptions())
  const [problem, setProblem] = useState<SaveOutcome | null>(null)
  const [conflict, setConflict] = useState(false)
  const sending = useRef(false)
  // Saving stops on a closed gate (for good) or a conflict (until the learner decides or answers again).
  const stopped = useRef<'closed' | 'conflict' | null>(null)
  const waitMs = useRef(SAVE_WINDOW_MS)
  const paced = useThrottler(() => flush(), { wait: SAVE_WINDOW_MS })
  const retry = useDebouncer(() => flush(), { wait: () => waitMs.current })
  const key = submissionOptions(id).queryKey

  async function failed(error: unknown) {
    sending.current = false
    const outcome = saveOutcome(error)
    setProblem(outcome)
    if (outcome === 'network' || outcome === 'throttled') {
      waitMs.current = retryDelayMs(error)
      retry.maybeExecute()
    } else if ((outcome === 'conflict' || outcome === 'gone') && (await stillDraft(queryClient, attempt))) {
      stopped.current = 'conflict'
      setConflict(true)
    } else if (outcome === 'closed') stopped.current = 'closed'
  }

  function flush() {
    const batch = queueOf(id)
    const draft = queryClient.getQueryData(key)
    // Offline nothing is sent: the queue holds the answers and the `online` event resumes.
    if (!batch.length || sending.current || stopped.current || !navigator.onLine || draft?.status !== 'draft') return
    sending.current = true
    const ids = batch.map(entry => entry.id)
    const request = { answers: patchOf(batch) }
    save.mutate(
      { path: { submission_id: id }, body: request, headers: { 'If-Match': draft.draft_version } },
      {
        onSuccess: fresh => {
          sending.current = false
          // A hand-in that overtook this save keeps its result in the cache.
          queryClient.setQueryData(key, old => (old?.status === 'draft' ? fresh : old))
          updateQueue(id, current => ack(current, ids))
          setProblem(null)
          if (queueOf(id).length) paced.maybeExecute()
        },
        onError: error => void failed(error),
      },
    )
  }

  // Back online, and on opening the attempt (a reload, a new tab): send what the queue still holds.
  useEffect(() => {
    if (online) paced.maybeExecute()
  }, [online, paced])

  const change = (item: string, answer: ItemAnswer) => {
    updateQueue(id, current => enqueue(current, { id: crypto.randomUUID(), item, answer }))
    if (stopped.current === 'conflict') stopped.current = null
    paced.maybeExecute()
  }
  const reloadAndRetry = async () => {
    await stillDraft(queryClient, attempt)
    stopped.current = null
    setConflict(false)
    flush()
  }
  return {
    answers: overlay(attempt.answers, queue),
    change,
    status: saveStatus(online, problem, queue.length),
    closed: problem === 'closed',
    conflict,
    setConflict,
    reloadAndRetry,
  }
}
