import { describe, expect, it, vi } from 'vite-plus/test'

import { summarizeSaveLedger } from '@/features/assessments/studio/workspace/saveLedger'
import {
  readAssessmentWorkspaceUrlState,
  writeAssessmentWorkspaceUrlState,
} from '@/features/assessments/studio/workspace/urlState'

describe('assessment workspace URL state', () => {
  it('reads canonical view, selected item, and selected issue from URL params', () => {
    expect(readAssessmentWorkspaceUrlState('?view=publish&item=item_1&issue=choice.prompt_missing')).toEqual({
      view: 'PUBLISH',
      selectedItemUuid: 'item_1',
      selectedIssueCode: 'choice.prompt_missing',
    })
  })

  it('accepts legacy tab param and normalizes unknown views to builder', () => {
    expect(readAssessmentWorkspaceUrlState('?tab=access').view).toBe('ACCESS')
    expect(readAssessmentWorkspaceUrlState('?view=unknown').view).toBe('BUILDER')
  })

  it('writes canonical params and removes legacy tab state', () => {
    const next = writeAssessmentWorkspaceUrlState('https://example.test/studio?tab=setup', {
      view: 'BUILDER',
      selectedItemUuid: 'item_2',
      selectedIssueCode: 'matching.pairs_missing',
    })

    expect(next).toBe('https://example.test/studio?view=builder&item=item_2&issue=matching.pairs_missing')
  })
})

describe('assessment workspace save ledger', () => {
  it('summarizes dirty and saving entries as blocking navigation state', () => {
    const retry = vi.fn()
    const summary = summarizeSaveLedger([
      { id: 'assessment', label: 'Assessment', state: 'saved', updatedAt: 1 },
      { id: 'item', label: 'Selected item', state: 'dirty', updatedAt: 2, retry },
    ])

    expect(summary.state).toBe('dirty')
    expect(summary.hasBlockingSaveState).toBe(true)
    expect(summary.entries).toHaveLength(2)
    expect(summary.liveMessage).toContain('Selected item: dirty')
  })

  it('treats idle-only entries as clean', () => {
    const summary = summarizeSaveLedger([{ id: 'assessment', label: 'Assessment', state: 'idle', updatedAt: 1 }])

    expect(summary.state).toBe('idle')
    expect(summary.hasBlockingSaveState).toBe(false)
    expect(summary.entries).toEqual([])
  })
})
