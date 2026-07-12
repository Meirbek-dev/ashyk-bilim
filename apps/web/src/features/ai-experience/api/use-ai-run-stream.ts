'use client'

import { useEffect, useMemo, useState } from 'react'
import { EventType } from '@ag-ui/client'
import type { BaseEvent, CustomEvent } from '@ag-ui/client'

import { createAGUIAgent } from '@/lib/ag-ui-transport'
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

function customEventPayload(event: CustomEvent): AIRunStreamEvent | null {
  const value = event.value
  if (!value || typeof value !== 'object' || !('state' in value)) return null
  const state = value.state
  if (
    state !== 'idle' &&
    state !== 'queued' &&
    state !== 'running' &&
    state !== 'complete' &&
    state !== 'failed' &&
    state !== 'cancelled'
  ) {
    return null
  }
  const message = 'message' in value && typeof value.message === 'string' ? value.message : undefined
  return message ? { state, message, payload: value } : { state, payload: value }
}

function toRunStreamEvent(event: BaseEvent): AIRunStreamEvent | null {
  switch (event.type) {
    case EventType.RUN_STARTED: {
      return { state: 'running', payload: event }
    }
    case EventType.RUN_FINISHED: {
      return { state: 'complete', payload: event }
    }
    case EventType.RUN_ERROR: {
      const message = typeof event.message === 'string' ? event.message : undefined
      return message ? { state: 'failed', message, payload: event } : { state: 'failed', payload: event }
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

  const agent = useMemo(() => (path ? createAGUIAgent(path) : null), [path])
  const current: AIRunStreamSnapshot =
    snapshot.path === path ? snapshot : { error: null, events: [], path, state: path ? 'queued' : 'idle' }

  useEffect(() => {
    if (!agent) return

    const abortController = new AbortController()

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
          onRunFailed: ({ error: runError }) => {
            if (abortController.signal.aborted) return
            setSnapshot(currentSnapshot => ({
              error: runError,
              events: currentSnapshot.path === path ? currentSnapshot.events : [],
              path,
              state: 'failed',
            }))
          },
        },
      )
      .catch((runError: unknown) => {
        if (abortController.signal.aborted) return
        setSnapshot(currentSnapshot => ({
          error: runError instanceof Error ? runError : new Error('AI stream failed'),
          events: currentSnapshot.path === path ? currentSnapshot.events : [],
          path,
          state: 'failed',
        }))
      })

    return () => {
      abortController.abort()
      agent.abortRun()
    }
  }, [agent, path])

  return { events: current.events, state: current.state, error: current.error }
}
