'use client'

import { useEffect, useRef, useState } from 'react'
import { EventType } from '@ag-ui/client'
import type { BaseEvent, CustomEvent } from '@ag-ui/client'

import { createAGUIAgent } from '@/lib/ag-ui-transport'
import { isApiError } from '@/lib/api/assertSuccess'
import { isTerminalAIState } from '../lib/ai-run-state'
import type { AIWorkState } from '../lib/ai-run-state'

export interface AIRunStreamEvent {
  state: AIWorkState
  message?: string
  payload?: unknown
}

interface AIRunStreamSnapshot {
  error: Error | null
  events: AIRunStreamEvent[]
  path: string | null
  state: AIWorkState
}

/** Run-event `state` values the server emits (`ai/runs.rs`): the client vocabulary minus the UI-only ones. */
const STREAM_STATES = new Set<AIWorkState>([
  'queued',
  'collecting_context',
  'running',
  'checking_evidence',
  'complete',
  'needs_human_review',
  'failed',
  'cancelled',
])

/** The server resumes from Redis stream ids only; `run-started` / `seq-N` / `run-end` are markers. */
const REDIS_STREAM_ID = /^\d+-\d+$/

const RECONNECT_DELAY_MS = 2000
const MAX_RECONNECTS = 5

function customEventPayload(event: CustomEvent): AIRunStreamEvent | null {
  const value = event.value
  if (!value || typeof value !== 'object' || !('state' in value)) return null
  const state = value.state as AIWorkState
  if (!STREAM_STATES.has(state)) return null
  const message = 'message' in value && typeof value.message === 'string' ? value.message : undefined
  return message ? { state, message, payload: value } : { state, payload: value }
}

export function toRunStreamEvent(event: BaseEvent): AIRunStreamEvent | null {
  switch (event.type) {
    case EventType.RUN_STARTED: {
      return { state: 'running', payload: event }
    }
    case EventType.RUN_FINISHED: {
      return { state: 'complete', payload: event }
    }
    case EventType.RUN_ERROR: {
      const code = 'code' in event && typeof event.code === 'string' ? event.code : null
      const state: AIWorkState = code === 'CANCELLED' ? 'cancelled' : 'failed'
      const message = typeof event.message === 'string' ? event.message : undefined
      return message ? { state, message, payload: event } : { state, payload: event }
    }
    case EventType.TEXT_MESSAGE_CONTENT:
    case EventType.REASONING_MESSAGE_CONTENT: {
      const message = typeof event.delta === 'string' ? event.delta : undefined
      return message ? { state: 'running', message, payload: event } : { state: 'running', payload: event }
    }
    case EventType.CUSTOM: {
      return customEventPayload(event as CustomEvent)
    }
    case EventType.STATE_SNAPSHOT:
    case EventType.STATE_DELTA: {
      return { state: 'running', payload: event }
    }
    default: {
      return null
    }
  }
}

export function useAIRunStream(path: string | null) {
  const [snapshot, setSnapshot] = useState<AIRunStreamSnapshot>({ error: null, events: [], path: null, state: 'idle' })
  const [attempt, setAttempt] = useState(0)
  const lastEventIdRef = useRef<{ id: string | null; path: string | null }>({ id: null, path: null })

  const current: AIRunStreamSnapshot =
    snapshot.path === path ? snapshot : { error: null, events: [], path, state: path ? 'queued' : 'idle' }

  useEffect(() => {
    if (!path) return

    if (lastEventIdRef.current.path !== path) lastEventIdRef.current = { id: null, path }
    const lastEventId = lastEventIdRef.current.id
    const agent = createAGUIAgent(path, {
      ...(lastEventId ? { headers: { 'Last-Event-ID': lastEventId } } : {}),
      onEventId: id => {
        if (REDIS_STREAM_ID.test(id)) lastEventIdRef.current = { id, path }
      },
    })
    const abortController = new AbortController()
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let settled = false

    const fail = (runError: Error) => {
      if (abortController.signal.aborted || settled) return
      settled = true
      setSnapshot(currentSnapshot => {
        const kept = currentSnapshot.path === path ? currentSnapshot : { events: [], state: 'queued' as const }
        // A dropped connection on a live run resumes from the last stream id; a real API error settles.
        if (!isApiError(runError) && !isTerminalAIState(kept.state) && attempt < MAX_RECONNECTS) {
          reconnectTimer = setTimeout(() => setAttempt(count => count + 1), RECONNECT_DELAY_MS)
          return { error: null, events: kept.events, path, state: kept.state }
        }
        return { error: runError, events: kept.events, path, state: 'failed' }
      })
    }

    void agent
      .runAgent(
        { abortController },
        {
          onEvent: ({ event }) => {
            const streamEvent = toRunStreamEvent(event)
            if (!streamEvent) return
            setSnapshot(currentSnapshot => ({
              error: null,
              events: currentSnapshot.path === path ? [...currentSnapshot.events, streamEvent] : [streamEvent],
              path,
              state: streamEvent.state,
            }))
          },
          onRunFailed: ({ error: runError }) => fail(runError),
        },
      )
      .catch((runError: unknown) => fail(runError instanceof Error ? runError : new Error('AI stream failed')))

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      abortController.abort()
      agent.abortRun()
    }
  }, [attempt, path])

  return { events: current.events, state: current.state, error: current.error }
}
