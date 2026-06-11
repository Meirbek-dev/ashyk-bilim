import { describe, expect, it } from 'vitest'

import type { AiStreamEvent } from '@/features/ai'
import { isAiStreamEvent, readAiStreamEventChunk } from '@/features/ai'

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
})
