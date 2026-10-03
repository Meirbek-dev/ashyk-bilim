import type { ToolCallResultEvent } from '@ag-ui/client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useReducer, useRef } from 'react'

import { getLocale } from '#/paraglide/runtime'
import { ApiError } from '#/shared/api/errors'
import type { ActivityId, AiThreadId, CourseId } from '#/shared/api/gen/types.gen'

import { finishedThreadId, STOPPED, turnReducer } from '../model/chat'
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

const toolText = (content: ToolCallResultEvent['content']) =>
  typeof content === 'string' ? content : content.map(part => (part.type === 'text' ? part.text : '')).join('')

/**
 * One Q&A turn over AG-UI (`POST /ai/qa/{course_id}/chat`): the answer streams into `turn`; on success the saved
 * thread is read before the turn may leave the screen (UX-299), and the thread list is invalidated. A retry sends
 * the same `client_turn_id` (the server replays a stored answer); unmount or "Stop" aborts the stream.
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
      const agent = qaChat(courseId)
      agent.threadId = threadId ?? clientTurnId
      agent.setMessages([{ id: clientTurnId, role: 'user', content: question }])
      let failure: string | null = null
      let result: unknown = null
      const forwardedProps = {
        client_turn_id: clientTurnId,
        language: getLocale(),
        ...(threadId ? { thread_id: threadId } : {}),
        ...(activityId ? { activity_id: activityId } : {}),
      }
      try {
        await agent.runAgent(
          { abortController: current, forwardedProps },
          {
            onTextMessageContentEvent: ({ event }) => dispatch({ type: 'delta', text: event.delta }),
            onToolCallResultEvent: ({ event }) => dispatch({ type: 'tool-result', content: toolText(event.content) }),
            onRunFinishedEvent: ({ event }) => {
              result = event.result
            },
            onRunErrorEvent: ({ event }) => {
              failure = event.code ?? 'COURSE_QA_FAILED'
            },
          },
        )
      } catch (error) {
        failure ??= current.signal.aborted ? STOPPED : error instanceof ApiError ? error.code : 'COURSE_QA_FAILED'
      }
      if (failure) {
        dispatch({ type: 'failed', code: failure })
        throw new Error(failure)
      }
      dispatch({ type: 'finished', result })
      const thread = finishedThreadId(result) ?? threadId
      // Fresh, not cached: the turn leaves the screen once the thread holds it. A failed read keeps the turn shown.
      if (thread)
        await queryClient.fetchQuery({ ...threadOptions(courseId, thread), staleTime: 0 }).catch(() => undefined)
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
