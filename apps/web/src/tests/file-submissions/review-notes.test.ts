import { describe, expect, it } from 'vite-plus/test'

import { earlierReviews } from '@/features/file-submissions/services/file-submissions'

const entry = (id: string, status: string, feedback = '', final_score: number | null = null) => ({
  id,
  status,
  feedback,
  final_score,
})

// DECISIONS 2026-10-11: the return comment stays readable under the work after the learner resubmits.
describe('file task review history', () => {
  it('keeps a return comment after the resubmission and never repeats the one the result shows', () => {
    const returned = entry('r1', 'returned', 'Add references')
    expect(earlierReviews({ status: 'submitted' }, [returned])).toEqual([returned])
    expect(earlierReviews({ status: 'returned' }, [returned])).toEqual([])
    const graded = entry('p1', 'published', '', 90)
    expect(earlierReviews({ status: 'published' }, [graded, returned])).toEqual([returned])
    expect(earlierReviews({ status: 'submitted' }, [entry('x', 'returned')])).toEqual([])
  })
})
