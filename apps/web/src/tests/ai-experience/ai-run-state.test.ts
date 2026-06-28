import { describe, expect, it } from 'vitest'

import { AI_STATE_LABELS, aiStateProgress, buildAIStages, isTerminalAIState } from '@/features/ai-experience'

describe('AI run state helpers', () => {
  it('marks terminal states', () => {
    expect(isTerminalAIState('complete')).toBe(true)
    expect(isTerminalAIState('needs_human_review')).toBe(true)
    expect(isTerminalAIState('running')).toBe(false)
  })

  it('calculates stable progress values', () => {
    expect(aiStateProgress('idle')).toBe(0)
    expect(aiStateProgress('running')).toBeGreaterThan(aiStateProgress('queued'))
    expect(aiStateProgress('complete')).toBe(100)
  })

  it('builds ordered timeline stages', () => {
    const stages = buildAIStages('running', AI_STATE_LABELS)

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
