import { describe, expect, it } from 'vitest'

import type { AiStreamEvent } from '@/features/ai'
import {
  createInitialAiRuntimeState,
  isAiStreamEvent,
  readAiStreamEventChunk,
  reduceAiStreamEvent,
} from '@/features/ai'
import { ACTIVITY_CHAT_PROTOCOL_VERSION, parseActivitySseDataLine } from '@services/ai/activity-chat-adapter'
import { aiV2StreamFixture } from './ai-v2-stream.fixture'

const baseEvent = {
  version: 2,
  event_id: 'event-1',
  run_id: 'run-1',
  thread_id: 'thread-1',
  sequence: 1,
  timestamp: '2026-06-11T00:00:00.000Z',
} as const

describe('AI event contract', () => {
  it('recognizes v2 status events from TanStack custom chunks', () => {
    const event: AiStreamEvent = {
      ...baseEvent,
      type: 'status.changed',
      payload: {
        status: 'retrieving',
        message: 'Retrieving course context',
      },
    }

    expect(isAiStreamEvent(event)).toBe(true)
    expect(readAiStreamEventChunk({ type: 'CUSTOM', value: event })).toEqual(event)
  })

  it('rejects non-versioned custom payloads', () => {
    expect(readAiStreamEventChunk({ type: 'CUSTOM', value: { type: 'ai_status' } })).toBeNull()
    expect(readAiStreamEventChunk({ type: 'TEXT', content: 'hello' })).toBeNull()
  })

  it('keeps artifact delta payloads typed', () => {
    const event: AiStreamEvent = {
      ...baseEvent,
      type: 'artifact.delta',
      payload: {
        final: true,
        artifact: {
          kind: 'hint_ladder',
          summary: 'Use one hint at a time.',
          citations: [],
          confidence: 0.6,
          policy_notes: [],
          next_actions: ['Check my attempt.'],
          steps: [
            {
              level: 1,
              title: 'Find the definition',
              hint: 'Look at the activity context first.',
              reveals_solution: false,
              citation_ids: [],
            },
          ],
        },
      },
    }

    const parsed = readAiStreamEventChunk({ type: 'CUSTOM', value: event })
    expect(parsed?.type).toBe('artifact.delta')
    if (parsed?.type === 'artifact.delta') {
      expect(parsed.payload.artifact.kind).toBe('hint_ladder')
    }
  })

  it('parses v2 SSE events as the primary activity chat protocol', () => {
    const firstEvent = aiV2StreamFixture[0]
    if (!firstEvent) throw new Error('fixture must include a run.started event')

    expect(ACTIVITY_CHAT_PROTOCOL_VERSION).toBe(2)
    expect(parseActivitySseDataLine(`data: ${JSON.stringify(firstEvent)}`)).toEqual(firstEvent)
  })

  it('reduces a full v2 stream into runtime state for the AI workspace', () => {
    const state = aiV2StreamFixture.reduce(reduceAiStreamEvent, createInitialAiRuntimeState())

    expect(state.activeRunId).toBe('run-v2-1')
    expect(state.activeThreadId).toBe('thread-activity-1')
    expect(state.events).toHaveLength(aiV2StreamFixture.length)
    expect(state.latestStatusMessage).toBeNull()
    expect(state.toolEvents).toHaveLength(2)
    expect(state.artifacts).toHaveLength(1)
    expect(state.artifacts[0]?.kind).toBe('hint_ladder')
    expect(state.citations).toHaveLength(1)
    expect(state.messageTextByRunId['run-v2-1']).toBe('Start by isolating the given values.')
    expect(state.sequenceError).toBeNull()
    expect(state.isFinished).toBe(true)
  })

  it('flags non-monotonic v2 stream sequence numbers', () => {
    const firstEvent = aiV2StreamFixture[0]
    const secondEvent = aiV2StreamFixture[1]
    if (!firstEvent || !secondEvent) throw new Error('fixture must include at least two events')

    const state = reduceAiStreamEvent(reduceAiStreamEvent(createInitialAiRuntimeState(), firstEvent), {
      ...secondEvent,
      sequence: 1,
    })

    expect(state.sequenceError).toContain('Non-monotonic AI stream sequence')
  })
})
