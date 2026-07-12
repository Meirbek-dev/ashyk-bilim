import { describe, expect, it } from 'vitest'

import { buildAIStages, isTerminalAIState } from '@/features/ai-experience'
import type { AIWorkState } from '@/features/ai-experience'

// Test-local labels. The app's single source of truth for these strings is the
// `AiExperience.states.labels` next-intl namespace, not a parallel TS object.
const TEST_LABELS: Record<AIWorkState, string> = {
  idle: 'idle',
  confirming: 'confirming',
  queued: 'queued',
  collecting_context: 'collecting_context',
  running: 'running',
  checking_evidence: 'checking_evidence',
  complete: 'complete',
  needs_human_review: 'needs_human_review',
  failed: 'failed',
  cancelled: 'cancelled',
}

describe('AI run state helpers', () => {
  it('marks terminal states', () => {
    expect(isTerminalAIState('complete')).toBe(true)
    expect(isTerminalAIState('needs_human_review')).toBe(true)
    expect(isTerminalAIState('running')).toBe(false)
  })

  it('builds ordered timeline stages', () => {
    const stages = buildAIStages('running', TEST_LABELS)

    expect(stages.map(stage => stage.state)).toEqual([
      'queued',
      'collecting_context',
      'running',
      'checking_evidence',
      'complete',
    ])
    expect(stages.find(stage => stage.state === 'running')?.complete).toBe(true)
    expect(stages.find(stage => stage.state === 'checking_evidence')?.complete).toBe(false)
  })
})
