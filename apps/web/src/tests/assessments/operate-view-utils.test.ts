import { describe, expect, it } from 'vite-plus/test'

import {
  buildSubmissionQueuePath,
  countItemActionPrompts,
  getItemActionPrompt,
  summarizeIntegrityEvents,
} from '@/features/assessments/studio/tabs/operateViewUtils'

describe('assessment operate view helpers', () => {
  it('builds submission queue paths with server-side filters and sorting', () => {
    expect(
      buildSubmissionQueuePath('assessment-1', {
        status: 'NEEDS_GRADING',
        search: '  miras  ',
        sortBy: 'final_score',
        sortDir: 'asc',
        page: 2,
        pageSize: 10,
        lateOnly: true,
      }),
    ).toBe(
      'assessments/assessment-1/submissions?status=NEEDS_GRADING&search=miras&late_only=true&sort_by=final_score&sort_dir=asc&page=2&page_size=10',
    )
  })

  it('turns item analytics into action prompts', () => {
    expect(
      getItemActionPrompt({ item_uuid: 'a', response_count: 12, correct_pct: 80, discrimination_index: 0.04 }),
    ).toBe('reviewContent')
    expect(
      getItemActionPrompt({ item_uuid: 'b', response_count: 12, correct_pct: 95, discrimination_index: 0.4 }),
    ).toBe('tooEasy')
    expect(
      getItemActionPrompt({ item_uuid: 'c', response_count: 12, correct_pct: 20, discrimination_index: 0.4 }),
    ).toBe('tooHard')

    expect(
      countItemActionPrompts([
        { item_uuid: 'a', response_count: 12, correct_pct: 80, discrimination_index: 0.04 },
        { item_uuid: 'b', response_count: 12, correct_pct: 95, discrimination_index: 0.4 },
        { item_uuid: 'c', response_count: 0, correct_pct: null, discrimination_index: null },
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
