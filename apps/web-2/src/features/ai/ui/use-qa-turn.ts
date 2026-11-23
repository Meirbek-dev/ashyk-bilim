import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useReducer, useRef } from 'react'

import { getLocale } from '#/paraglide/runtime'
import { ApiError } from '#/shared/api/errors'
import type { ActivityId, AiThreadId, CourseId } from '#/shared/api/gen/types.gen'

import { finishedThreadId, STOPPED, turnReducer, type TurnAction } from '../model/chat'
import { threadOptions, threadsKey } from '../queries'
import { qaChat } from '../transport'

type QaTurnOptions = {
  courseId: CourseId
  activityId: ActivityId | undefined
  threadId: AiThreadId | undefined
  /** The thread a first question created: the caller puts it into the URL. */
  onThread: (threadId: AiThreadId) => void
}

type Ask = { question: string; clientTurnId: string }

type Outcome = { failure: string } | { failure: null; result: unknown }

/**
 * Reads one turn's events into `dispatch`. A stream that closes without `RUN_FINISHED` (a proxy hang-up) failed:
 * a retry replays the stored answer.
 */
async function readTurn(
  courseId: CourseId,
  input: Parameters<typeof qaChat>[1],
  signal: AbortSignal,
  dispatch: (action: TurnAction) => void,
): Promise<Outcome> {
  const fallback = () => (signal.aborted ? STOPPED : 'COURSE_QA_FAILED')
  let failure: string | null = null
  let finished: { result: unknown } | null = null
  try {
    for await (const event of qaChat(courseId, input, signal)) {
      if (event.type === 'TEXT_MESSAGE_CONTENT') dispatch({ type: 'delta', text: event.delta })
      else if (event.type === 'TOOL_CALL_RESULT') dispatch({ type: 'tool-result', content: event.content })
      else if (event.type === 'RUN_FINISHED') finished = { result: event.result }
      else if (event.type === 'RUN_ERROR') failure ??= event.code
    }
  } catch (error) {
    failure ??= error instanceof ApiError && !signal.aborted ? error.code : fallback()
  }
  if (failure) return { failure }
  return finished ? { failure: null, result: finished.result } : { failure: fallback() }
}

/**
 * One Q&A turn over its AG-UI event stream (`POST /ai/qa/{course_id}/chat`): the answer streams into `turn`; on
 * success the saved thread is read before the turn may leave the screen (UX-299), and the thread list is
 * invalidated. A retry sends the same `client_turn_id` (the server replays a stored answer); unmount or "Stop"
 * aborts the stream.
 */
export function useQaTurn({ courseId, activityId, threadId, onThread }: QaTurnOptions) {
  const [turn, dispatch] = useReducer(turnReducer, null)
  const controller = useRef<AbortController | null>(null)
  const queryClient = useQueryClient()
  useEffect(() => () => controller.current?.abort(), [])
  const ask = useMutation({
    mutationFn: async ({ question, clientTurnId }: Ask) => {
      const current = new AbortController()
      controller.current = current
      dispatch({ type: 'ask', clientTurnId, question })
      const outcome = await readTurn(
        courseId,
        {
          threadId: threadId ?? clientTurnId,
          message: { id: clientTurnId, role: 'user', content: question },
          forwardedProps: {
            client_turn_id: clientTurnId,
            language: getLocale(),
            ...(threadId ? { thread_id: threadId } : {}),
            ...(activityId ? { activity_id: activityId } : {}),
          },
        },
        current.signal,
        dispatch,
      )
      if (outcome.failure !== null) {
        dispatch({ type: 'failed', code: outcome.failure })
        throw new Error(outcome.failure)
      }
      dispatch({ type: 'finished', result: outcome.result })
      const thread = finishedThreadId(outcome.result) ?? threadId
      // Fresh, not cached: the turn leaves the screen once the thread holds it. A failed read keeps the turn shown.
      if (thread) await queryClient.query({ ...threadOptions(courseId, thread), staleTime: 0 }).catch(() => undefined)
      // A new thread goes into the URL before the thread list is read again (`meta.invalidates`).
      if (thread && thread !== threadId) onThread(thread)
      return thread
    },
    meta: { invalidates: [threadsKey(courseId)] },
  })
  return {
    turn,
    pending: ask.isPending,
    ask: (question: string) => ask.mutate({ question, clientTurnId: crypto.randomUUID() }),
    retry: () => turn && ask.mutate({ question: turn.question, clientTurnId: turn.clientTurnId }),
    stop: () => controller.current?.abort(),
  }
}
