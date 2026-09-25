/** @vitest-environment jsdom */
// UX-213: dropped from a quiz's allowlist, the take gate (attempt-state) says
// 403 while `submissions/me` still answers — the learner sees their own
// published result read-only, not a page error.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vite-plus/test'

import { useAssessmentAttempt } from '@/features/assessments/hooks/useAssessment'
import { APIError } from '@/lib/api/assertSuccess'

const mocks = vi.hoisted(() => ({ submissions: vi.fn() }))

vi.mock('@/services/telemetry/client', () => ({ reportClientError: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/features/assessments/queries', () => ({
  assessmentByActivityQueryOptions: (id: string) => ({
    queryKey: ['assessment', id],
    queryFn: async () => ({
      id: 'q1',
      activity_id: id,
      kind: 'quiz',
      title: 'Quiz',
      description: '',
      lifecycle: 'published',
      content_version: 1,
      policy_version: 1,
      items: [],
      policy: {
        allow_late: true,
        attempt_penalty_percent: 0,
        due_at_unix: null,
        late_policy: { kind: 'none' },
        max_attempts: 1,
        passing_score: 50,
        review_visibility: 'score_only',
        time_limit_seconds: null,
      },
    }),
  }),
}))
vi.mock('@/features/assessments/submission-client', () => ({ getMyAssessmentSubmissions: mocks.submissions }))
vi.mock('@/lib/api-client', () => ({
  apiJson: async () => {
    throw new APIError({ code: 'forbidden', message: "not on this assessment's access list", status: 403 })
  },
}))

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

describe('attempt page off the allowlist (UX-213)', () => {
  it('shows the published result read-only instead of the 403', async () => {
    mocks.submissions.mockResolvedValue([
      { id: 's1', status: 'GRADED', release_state: 'visible', attempt_number: 1, final_score: 80, auto_score: 80 },
    ])
    const { result } = renderHook(() => useAssessmentAttempt('a1'), { wrapper })
    await waitFor(() => expect(result.current.vm).not.toBeNull())
    expect(result.current.error).toBeNull()
    const vm = result.current.vm?.surface === 'ATTEMPT' ? result.current.vm.vm : null
    expect(vm).toMatchObject({
      accessClosed: true,
      canStart: false,
      canContinue: false,
      recommendedAction: 'viewResult',
      score: { percent: 80, source: 'final' },
    })
  })

  it('without attempts: still no page error, nothing to start', async () => {
    mocks.submissions.mockResolvedValue([])
    const { result } = renderHook(() => useAssessmentAttempt('a2'), { wrapper })
    await waitFor(() => expect(result.current.vm).not.toBeNull())
    const vm = result.current.vm?.surface === 'ATTEMPT' ? result.current.vm.vm : null
    expect(vm).toMatchObject({ accessClosed: true, canStart: false, recommendedAction: 'noAction' })
  })
})
