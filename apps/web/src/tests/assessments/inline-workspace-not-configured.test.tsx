/** @vitest-environment jsdom */
// Gauntlet learner7: a published code-challenge activity whose assessment was
// never created (`GET /activities/{id}/assessment → 404`) showed the error card
// with a trace id plus a «Start» that could not work. It is an empty state; only
// course editors get a studio link, and the bottom bar CTA is replaced by an
// inert, explained control.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import InlineAssessmentWorkspace from '@/features/assessments/shell/InlineAssessmentWorkspace'
import { APIError } from '@/lib/api/assertSuccess'

const mocks = vi.hoisted(() => ({
  error: null as unknown,
  can: vi.fn(() => false),
  setBottomBarAction: vi.fn(),
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@components/ui/AppLink', () => ({ default: (props: React.ComponentProps<'a'>) => <a {...props} /> }))
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ can: mocks.can }) }))
vi.mock('@/hooks/useApiError', () => ({
  useApiError: () => ({
    toastApiError: vi.fn(),
    handleApiError: (_error: unknown, options: { fallback: string }) => ({
      message: options.fallback,
      showRetry: false,
    }),
  }),
}))
vi.mock('@/features/assessments/hooks/useAssessment', () => ({
  useAssessmentAttempt: () => ({ vm: null, isLoading: false, error: mocks.error }),
}))
vi.mock('@/features/assessments/shell/ActivityLayoutContext', () => ({
  useActivityLayout: () => ({
    mode: 'CONTENT',
    setMode: vi.fn(),
    bottomBarAction: null,
    setBottomBarAction: mocks.setBottomBarAction,
  }),
}))
vi.mock('@/features/learner-course/api', () => ({
  learnerCourseStateQueryOptions: () => ({ queryKey: ['learner-state'], queryFn: async () => null, enabled: false }),
}))

function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <InlineAssessmentWorkspace activityUuid="a1" courseUuid="c1" />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.can.mockReset().mockReturnValue(false)
  mocks.setBottomBarAction.mockReset()
})

describe('InlineAssessmentWorkspace without an assessment', () => {
  it('shows the "not set up yet" empty state for learners and disables the bottom CTA', () => {
    mocks.error = new APIError({ code: 'not-found', status: 404, message: 'assessment not found', requestId: 'r1' })
    renderWorkspace()
    expect(screen.getByText('notConfiguredTitle')).toBeInTheDocument()
    expect(screen.queryByText('startActivityFailed')).not.toBeInTheDocument()
    expect(screen.queryByText(/r1/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'openStudio' })).not.toBeInTheDocument()
    expect(mocks.setBottomBarAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ label: 'notConfiguredTitle', disabled: true }),
    )
  })

  it('links course editors to the studio', () => {
    mocks.can.mockReturnValue(true)
    mocks.error = new APIError({ code: 'not-found', status: 404, message: 'nope' })
    renderWorkspace()
    expect(screen.getByRole('button', { name: 'openStudio' })).toHaveAttribute(
      'href',
      '/dash/courses/c1/activity/a1/studio',
    )
  })

  it('keeps the error card for every other failure', () => {
    mocks.error = new APIError({ code: 'forbidden', status: 403, message: 'denied' })
    renderWorkspace()
    expect(screen.getAllByText('startActivityFailed').length).toBeGreaterThan(0)
    expect(screen.queryByText('notConfiguredTitle')).not.toBeInTheDocument()
  })
})
