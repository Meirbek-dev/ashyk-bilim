import { describe, expect, it } from 'vite-plus/test'

import { fileSubmissionQueryOptions } from '@/features/file-submissions/student/FileSubmissionWorkspace'

// UX-068: a hand-in waiting on the teacher polls for the release; a released one does not.
describe('learner file-activity query', () => {
  const interval = (status: string | null) => {
    const options = fileSubmissionQueryOptions('activity_1')
    const refetchInterval = options.refetchInterval as (query: { state: { data: unknown } }) => number | false
    return refetchInterval({ state: { data: status ? { current_attempt: { status } } : null } })
  }

  it('polls while submitted, graded or returned and stops once published', () => {
    expect(fileSubmissionQueryOptions('activity_1').refetchOnWindowFocus).toBe(true)
    expect(interval('submitted')).toBe(10_000)
    expect(interval('graded')).toBe(10_000)
    expect(interval('returned')).toBe(10_000)
    expect(interval('published')).toBe(false)
    expect(interval('draft')).toBe(false)
    expect(interval(null)).toBe(false)
  })
})
