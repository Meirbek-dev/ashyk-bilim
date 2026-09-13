import { describe, expect, it } from 'vite-plus/test'

import {
  countItemActionPrompts,
  getItemActionPrompt,
  summarizeIntegrityEvents,
} from '@/features/assessments/studio/tabs/operateViewUtils'

describe('assessment operate view helpers', () => {
  it('turns item analytics into action prompts', () => {
    expect(
      getItemActionPrompt({ item_id: 'a', response_count: 12, correct_pct: 80, discrimination_index: 0.04 }),
    ).toBe('reviewContent')
    expect(
      getItemActionPrompt({ item_id: 'b', response_count: 12, correct_pct: 95, discrimination_index: 0.4 }),
    ).toBe('tooEasy')
    expect(
      getItemActionPrompt({ item_id: 'c', response_count: 12, correct_pct: 20, discrimination_index: 0.4 }),
    ).toBe('tooHard')

    expect(
      countItemActionPrompts([
        { item_id: 'a', response_count: 12, correct_pct: 80, discrimination_index: 0.04 },
        { item_id: 'b', response_count: 12, correct_pct: 95, discrimination_index: 0.4 },
        { item_id: 'c', response_count: 0, correct_pct: null, discrimination_index: null },
      ]),
    ).toEqual({ reviewContent: 1, tooEasy: 1, tooHard: 0, healthy: 1 })
  })

  it('summarizes integrity events from submission metadata', () => {
    expect(
      summarizeIntegrityEvents([
        {
          submission_uuid: 'sub-1',
          metadata_json: { violations: [{ kind: 'tab_switch', count: 2 }, { kind: 'copy_paste' }] },
        },
        {
          submission_uuid: 'sub-2',
          metadata_json: { violations: [{ kind: 'tab_switch' }] },
        },
      ]),
    ).toEqual({
      totalEvents: 4,
      affectedSubmissions: 2,
      topKind: 'tab_switch',
    })
  })
})
