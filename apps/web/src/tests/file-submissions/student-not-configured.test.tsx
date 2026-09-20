/** @vitest-environment jsdom */
// Gauntlet F15: a published file-submission activity whose config was never
// created (`GET /activities/{id}/file-submission → 404`) showed an error card
// with a trace id; it is an empty state, and only teachers get a studio link.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import FileSubmissionWorkspace from '@/features/file-submissions/student/FileSubmissionWorkspace'
import type { Activity, CourseStructure } from '@components/Contexts/CourseContext'
import { APIError } from '@/lib/api/assertSuccess'

const mocks = vi.hoisted(() => ({ getActivity: vi.fn(), can: vi.fn(() => false) }))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'ru' }))
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
vi.mock('@/features/file-submissions/services/file-submissions', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/file-submissions/services/file-submissions')>()),
  getFileSubmissionByActivity: (...args: unknown[]) => mocks.getActivity(...args),
}))

const activity = { activity_uuid: 'activity_a1', activity_type: 'TYPE_FILE_SUBMISSION' } as Activity
const course = { course_uuid: 'course_c1' } as CourseStructure

function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <FileSubmissionWorkspace activity={activity} course={course} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.can.mockReset().mockReturnValue(false)
  mocks.getActivity.mockReset()
})

describe('FileSubmissionWorkspace without a submission config', () => {
  it('shows the "not set up yet" empty state for learners, without the error trace', async () => {
    mocks.getActivity.mockRejectedValue(
      new APIError({ code: 'not-found', status: 404, message: 'file submission not found', requestId: 'req-1' }),
    )
    renderWorkspace()
    expect(await screen.findByText('notConfiguredTitle')).toBeInTheDocument()
    expect(screen.queryByText('notAvailable')).not.toBeInTheDocument()
    expect(screen.queryByText(/req-1/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'openStudio' })).not.toBeInTheDocument()
  })

  it('links course editors to the studio', async () => {
    mocks.can.mockReturnValue(true)
    mocks.getActivity.mockRejectedValue(new APIError({ code: 'not-found', status: 404, message: 'nope' }))
    renderWorkspace()
    expect(await screen.findByRole('button', { name: 'openStudio' })).toHaveAttribute(
      'href',
      '/dash/courses/c1/activity/a1/studio',
    )
  })

  it('keeps the error card for every other failure', async () => {
    mocks.getActivity.mockRejectedValue(new APIError({ code: 'forbidden', status: 403, message: 'denied' }))
    renderWorkspace()
    expect((await screen.findAllByText('notAvailable')).length).toBeGreaterThan(0)
    expect(screen.queryByText('notConfiguredTitle')).not.toBeInTheDocument()
  })
})
