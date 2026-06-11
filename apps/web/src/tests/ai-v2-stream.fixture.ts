import type { AiStreamEvent } from '@/features/ai'

const timestamp = '2026-06-11T00:00:00.000Z'

export const aiV2StreamFixture = [
  {
    version: 2,
    type: 'run.started',
    event_id: 'event-1',
    run_id: 'run-v2-1',
    thread_id: 'thread-activity-1',
    sequence: 1,
    timestamp,
    payload: {
      intent: 'hint_ladder',
    },
  },
  {
    version: 2,
    type: 'status.changed',
    event_id: 'event-2',
    run_id: 'run-v2-1',
    thread_id: 'thread-activity-1',
    sequence: 2,
    timestamp,
    payload: {
      status: 'retrieving',
      message: 'Retrieving course context',
    },
  },
  {
    version: 2,
    type: 'tool.started',
    event_id: 'event-3',
    run_id: 'run-v2-1',
    thread_id: 'thread-activity-1',
    sequence: 3,
    timestamp,
    payload: {
      tool_name: 'course_context',
      label: 'Course context',
      status: 'running',
      detail: 'Scanning lesson, rubric, and recent attempts',
    },
  },
  {
    version: 2,
    type: 'citation.added',
    event_id: 'event-4',
    run_id: 'run-v2-1',
    thread_id: 'thread-activity-1',
    sequence: 4,
    timestamp,
    payload: {
      citation: {
        id: 'citation-1',
        label: 'Lesson 4.2',
        source_type: 'activity',
        excerpt: 'Use one hint at a time before revealing the final answer.',
        score: 0.92,
      },
    },
  },
  {
    version: 2,
    type: 'message.delta',
    event_id: 'event-5',
    run_id: 'run-v2-1',
    thread_id: 'thread-activity-1',
    sequence: 5,
    timestamp,
    payload: {
      delta: 'Start by isolating the given values.',
    },
  },
  {
    version: 2,
    type: 'artifact.delta',
    event_id: 'event-6',
    run_id: 'run-v2-1',
    thread_id: 'thread-activity-1',
    sequence: 6,
    timestamp,
    payload: {
      final: true,
      artifact: {
        kind: 'hint_ladder',
        summary: 'Use the activity context before solving.',
        citations: [
          {
            id: 'citation-1',
            label: 'Lesson 4.2',
            source_type: 'activity',
            excerpt: 'Use one hint at a time before revealing the final answer.',
            score: 0.92,
          },
        ],
        confidence: 0.74,
        policy_notes: [],
        next_actions: ['Check my attempt.'],
        steps: [
          {
            level: 1,
            title: 'Name the known values',
            hint: 'Write each value from the prompt before choosing a formula.',
            reveals_solution: false,
            citation_ids: ['citation-1'],
          },
        ],
      },
    },
  },
  {
    version: 2,
    type: 'tool.finished',
    event_id: 'event-7',
    run_id: 'run-v2-1',
    thread_id: 'thread-activity-1',
    sequence: 7,
    timestamp,
    payload: {
      tool_name: 'course_context',
      label: 'Course context',
      status: 'complete',
    },
  },
  {
    version: 2,
    type: 'run.finished',
    event_id: 'event-8',
    run_id: 'run-v2-1',
    thread_id: 'thread-activity-1',
    sequence: 8,
    timestamp,
    payload: {
      usage: {
        input_tokens: 120,
        output_tokens: 48,
      },
    },
  },
] satisfies AiStreamEvent[]
