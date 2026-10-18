import { describe, expect, test } from 'vite-plus/test'

import type { FileGradingEntry } from '#/shared/api/gen/types.gen'

import { earlierNotes } from './task'

const entry = (over: Partial<FileGradingEntry>): FileGradingEntry => ({
  created_at_unix: 1,
  feedback: '',
  final_score: null,
  graded_by: null,
  id: 'e',
  penalty_pct: 0,
  raw_score: null,
  status: 'returned',
  ...over,
})

describe('review history', () => {
  test('B-FSB-22 a return comment stays listed after a resubmission; the one the result shows is not repeated', () => {
    const returned = entry({ id: 'r1', feedback: 'Add references' })
    expect(earlierNotes({ status: 'submitted' }, [returned])).toEqual([returned])
    expect(earlierNotes({ status: 'returned' }, [returned])).toEqual([])
    const graded = entry({ id: 'p1', status: 'published', final_score: 90 })
    expect(earlierNotes({ status: 'published' }, [graded, returned])).toEqual([returned])
    expect(earlierNotes({ status: 'submitted' }, [entry({ id: 'x' })])).toEqual([])
  })
})
