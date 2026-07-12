'use client'

import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { createAGUIAgent } from '@/lib/ag-ui-transport'
import type { AICitation } from '@/features/ai-experience'

interface CourseQAChatOptions {
  activityUuid?: string | null
  courseUuid: string
  onThread: (threadUuid: string) => void
  threadUuid: string | null
}

interface CourseQAChatSnapshot {
  citations: AICitation[]
  errorCode: string | null
  partialAnswer: string
  pendingQuestion: string | null
  status: 'idle' | 'streaming' | 'stopping' | 'failed' | 'cancelled'
}

const initialSnapshot: CourseQAChatSnapshot = {
  citations: [],
  errorCode: null,
  partialAnswer: '',
  pendingQuestion: null,
  status: 'idle',
}

function runResultThreadUuid(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('thread_uuid' in value)) return null
  return typeof value.thread_uuid === 'string' ? value.thread_uuid : null
}

function citationResult(value: string): AICitation[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || !('citations' in parsed) || !Array.isArray(parsed.citations)) return []
    return parsed.citations as AICitation[]
  } catch {
    return []
  }
}

export function useCourseQAChat({ activityUuid, courseUuid, onThread, threadUuid }: CourseQAChatOptions) {
  const queryClient = useQueryClient()
  const agentRef = useRef<ReturnType<typeof createAGUIAgent> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastTurnRef = useRef<{ clientTurnId: string; question: string } | null>(null)
  const [snapshot, setSnapshot] = useState(initialSnapshot)

  const submit = useCallback(
    async (rawQuestion: string, retryClientTurnId?: string) => {
      const question = rawQuestion.trim()
      if (!question || abortRef.current) return

      const clientTurnId = retryClientTurnId ?? globalThis.crypto.randomUUID()
      const abortController = new AbortController()
      const agent = createAGUIAgent(`ai/qa/${courseUuid}/chat`)
      agent.threadId = threadUuid ?? clientTurnId
      agent.setMessages([{ id: clientTurnId, role: 'user', content: question }])
      agentRef.current = agent
      abortRef.current = abortController
      lastTurnRef.current = { clientTurnId, question }
      setSnapshot({
        citations: [],
        errorCode: null,
        partialAnswer: '',
        pendingQuestion: question,
        status: 'streaming',
      })

      try {
        let protocolError: string | null = null
        const response = await agent.runAgent(
          {
            abortController,
            forwardedProps: {
              activity_uuid: activityUuid || undefined,
              client_turn_id: clientTurnId,
              language: 'auto',
              thread_uuid: threadUuid || undefined,
            },
          },
          {
            onTextMessageContentEvent: ({ textMessageBuffer }) => {
              setSnapshot(current => ({ ...current, partialAnswer: textMessageBuffer }))
            },
            onToolCallResultEvent: ({ event }) => {
              const citations = citationResult(event.content)
              if (citations.length) setSnapshot(current => ({ ...current, citations }))
            },
            onRunErrorEvent: ({ event }) => {
              protocolError = event.code ?? 'COURSE_QA_FAILED'
              setSnapshot(current => ({ ...current, errorCode: protocolError, status: 'failed' }))
            },
            onRunFailed: ({ error }) => {
              if (!abortController.signal.aborted) {
                setSnapshot(current => ({
                  ...current,
                  errorCode: error.message || 'COURSE_QA_FAILED',
                  status: 'failed',
                }))
              }
            },
          },
        )
        if (protocolError) throw new Error(protocolError)
        const nextThreadUuid = runResultThreadUuid(response.result) ?? threadUuid
        if (nextThreadUuid) onThread(nextThreadUuid)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['course-qa-threads', courseUuid] }),
          ...(nextThreadUuid
            ? [queryClient.invalidateQueries({ queryKey: ['course-qa-thread', courseUuid, nextThreadUuid] })]
            : []),
        ])
        setSnapshot(initialSnapshot)
      } catch (error) {
        if (abortController.signal.aborted) {
          setSnapshot(current => ({ ...current, errorCode: null, status: 'cancelled' }))
        } else {
          setSnapshot(current => ({
            ...current,
            errorCode: error instanceof Error ? error.message : 'COURSE_QA_FAILED',
            status: 'failed',
          }))
        }
      } finally {
        if (abortRef.current === abortController) abortRef.current = null
        if (agentRef.current === agent) agentRef.current = null
      }
    },
    [activityUuid, courseUuid, onThread, queryClient, threadUuid],
  )

  const stop = useCallback(() => {
    if (!abortRef.current) return
    setSnapshot(current => ({ ...current, status: 'stopping' }))
    abortRef.current.abort()
    agentRef.current?.abortRun()
  }, [])

  const retry = useCallback(() => {
    const turn = lastTurnRef.current
    if (turn) void submit(turn.question, turn.clientTurnId)
  }, [submit])

  const reset = useCallback(() => {
    if (!abortRef.current) setSnapshot(initialSnapshot)
  }, [])

  return {
    ...snapshot,
    pending: snapshot.status === 'streaming' || snapshot.status === 'stopping',
    reset,
    retry,
    stop,
    submit,
  }
}
