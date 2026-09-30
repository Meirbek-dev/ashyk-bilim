import { describe, expect, it, vi } from 'vite-plus/test'

import { courseDiscussionsQueryOptions } from '@/features/courses/queries/course.query'

vi.mock('@services/courses/discussions', () => ({ getCourseDiscussions: vi.fn() }))

// UX-062: a learner post / teacher reply shows up on the other side's open
// course page without a reload — the thread refetches on focus and every 15 s.
describe('course discussions query', () => {
  it('polls while the page is open and refetches on focus', () => {
    const options = courseDiscussionsQueryOptions('c1')
    expect(options).toMatchObject({ refetchInterval: 15_000, refetchOnWindowFocus: true, staleTime: 5_000 })
    expect(options.queryKey).toEqual(['courses', 'discussions', 'c1', { includeReplies: true }])
  })
})
