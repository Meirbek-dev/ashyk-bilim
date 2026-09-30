import { describe, expect, it } from 'vite-plus/test'

import { fileSubmissionQueryOptions } from '@/features/file-submissions/student/FileSubmissionWorkspace'

// UX-068: a hand-in waiting on the teacher polls for the release.
// BUG-158: a released one keeps a slower poll — a gate assigned meanwhile must show.
describe('learner file-activity query', () => {
  const interval = (status: string | null) => {
    const options = fileSubmissionQueryOptions('activity_1')
    const refetchInterval = options.refetchInterval as (query: { state: { data: unknown } }) => number | false
    return refetchInterval({ state: { data: status ? { current_attempt: { status } } : null } })
  }

  it('polls while submitted, graded or returned, slower once published; a draft polls for the deadline/gate (UX-115)', () => {
    expect(fileSubmissionQueryOptions('activity_1').refetchOnWindowFocus).toBe('always')
    expect(interval('submitted')).toBe(10_000)
    expect(interval('graded')).toBe(10_000)
    expect(interval('returned')).toBe(10_000)
    expect(interval('published')).toBe(15_000)
    // UX-115: an open draft must notice a closed deadline / a new remediation gate without a click.
    expect(interval('draft')).toBe(15_000)
    expect(interval(null)).toBe(false)
  })
})
