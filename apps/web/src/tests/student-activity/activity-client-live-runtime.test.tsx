/** @vitest-environment jsdom */
// UX-080: a lesson published while the activity page is open never reached the
// sidebar — the runtime was a server prop, not a query with learner-state's focus policy.
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime'

vi.mock('@components/Contexts/CourseContext', () => ({ CourseProvider: (p: { children: React.ReactNode }) => p.children }))
vi.mock('@/features/assessments/shell/ActivityLayoutContext', () => ({
  ActivityLayoutProvider: (p: { children: React.ReactNode }) => p.children,
}))
vi.mock('@/features/student-activity/shell/StudentActivityWorkspace', () => ({ default: () => null }))
vi.mock('@/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/ActivityContentRenderer', () => ({
  ActivityContentRenderer: () => null,
}))
vi.mock('@/features/student-activity/api/runtime', () => ({ getStudentActivityRuntime: vi.fn() }))

import ActivityClient from '@/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/activity'

describe('ActivityClient runtime query', () => {
  it('seeds the runtime query from the server and refetches on focus after 5 s', () => {
    const queryClient = new QueryClient()
    const runtime = { permissions: { can_view: true } } as StudentActivityRuntime
    render(
      <QueryClientProvider client={queryClient}>
        <ActivityClient activityid="a1" courseuuid="c1" activity={null} course={{} as never} runtime={runtime} />
      </QueryClientProvider>,
    )
    const query = queryClient.getQueryCache().find({ queryKey: ['student-activity', 'runtime', 'c1', 'a1'] })
    expect(query?.state.data).toBe(runtime)
    expect(query?.options).toMatchObject({ staleTime: 5_000, refetchOnWindowFocus: true, refetchOnMount: true })
  })
})
