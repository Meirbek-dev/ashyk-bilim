import { describe, expect, it, vi } from 'vite-plus/test'

// UX-104: a quiz published while the learner's course page is open never
// reached the outline — the page seeds the structure query from the server
// prop, so the query refetches on every focus and every 30 s regardless of
// staleness.

vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn(), apiResult: vi.fn() }))

import { learnerCourseStructureQueryOptions } from '@/features/courses/queries/course.query'

describe('learner course structure query', () => {
  it('refetches on every focus and every 30 s', () => {
    expect(learnerCourseStructureQueryOptions('c1')).toMatchObject({
      queryKey: ['courses', 'structure', 'c1', false],
      refetchOnWindowFocus: 'always',
      refetchOnMount: 'always',
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    })
  })
})
