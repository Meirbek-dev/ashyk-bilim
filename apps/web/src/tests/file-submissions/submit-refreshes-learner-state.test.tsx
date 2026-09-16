/** @vitest-environment jsdom */
// Critic 9 F15: after «Отправить файлы» the header badge stayed «Не начато»
// and the footer «Начать» until a reload — the file submit must refresh the
// learner-state projection the way the quiz submit does.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import FileSubmissionWorkspace from '@/features/file-submissions/student/FileSubmissionWorkspace'
import type { Activity, CourseStructure } from '@components/Contexts/CourseContext'

const mocks = vi.hoisted(() => ({ getActivity: vi.fn(), submit: vi.fn(), start: vi.fn(), refresh: vi.fn(), apiJson: vi.fn() }))

vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
  useFormatter: () => ({ number: (n: number) => String(n) }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }))
vi.mock('@components/ui/AppLink', () => ({ default: (props: React.ComponentProps<'a'>) => <a {...props} /> }))
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ can: () => false, user: { id: 'u-learner' } }) }))
vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))
vi.mock('@/features/content-markdown', () => ({ MarkdownContent: () => null }))
vi.mock('@/hooks/useApiError', () => ({
  useApiError: () => ({ toastApiError: vi.fn(), handleApiError: () => ({ message: '', showRetry: false }) }),
}))
vi.mock('@/features/file-submissions/services/file-submissions', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/file-submissions/services/file-submissions')>()),
  getFileSubmissionByActivity: (...args: unknown[]) => mocks.getActivity(...args),
  submitFileSubmission: (...args: unknown[]) => mocks.submit(...args),
  startFileSubmissionDraft: (...args: unknown[]) => mocks.start(...args),
}))

const draft = {
  id: 'att-1',
  status: 'draft',
  version: 1,
  attempt_number: 1,
  is_late: false,
  files: [{ id: 'f1', upload_id: 'u1', filename: 'tiny.pdf', size_bytes: 69, mime_type: 'application/pdf' }],
}
const config = {
  id: 'fs-1',
  instructions: '',
  lifecycle: 'published',
  allowed_mime_types: [],
  max_files: 1,
  max_file_size_mb: 25,
  due_at_unix: null,
  current_attempt: draft,
  attempts: [draft],
}

beforeEach(() => {
  mocks.getActivity.mockReset().mockResolvedValue(config)
  mocks.submit.mockReset().mockResolvedValue({ ...draft, status: 'submitted' })
  mocks.start.mockReset().mockResolvedValue({ ...draft, id: 'att-2', attempt_number: 2 })
  mocks.refresh.mockReset()
  mocks.apiJson.mockReset().mockResolvedValue([])
})

describe('FileSubmissionWorkspace submit', () => {
  it('invalidates the learner-course projection and refreshes the runtime after a submit', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    render(
      <QueryClientProvider client={client}>
        <FileSubmissionWorkspace
          activity={{ activity_uuid: 'activity_a1', activity_type: 'TYPE_FILE_SUBMISSION' } as Activity}
          course={{ course_uuid: 'course_c1' } as CourseStructure}
        />
      </QueryClientProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'submitFiles' }))
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith('fs-1', expect.any(Array), 1))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['learner-course'] }))
    // UX-097: the activity runtime is seeded from the server prop (`initialData`),
    // so `router.refresh()` alone never reached the header chip — invalidate it too.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['student-activity'] })
    expect(mocks.refresh).toHaveBeenCalled()
  })

  // BUG-158: a gate assigned while the result was open — the new-attempt 403
  // names the reason; refetch the attempt and the learner's sessions, no toast.
  it('refetches the attempt and the gate on a gated new attempt', async () => {
    const { APIError } = await import('@/lib/api/assertSuccess')
    const published = { ...draft, status: 'published', final_score: 70, late_penalty_pct: 0, feedback: '' }
    mocks.getActivity.mockResolvedValue({ ...config, max_attempts: 2, current_attempt: published, attempts: [published] })
    mocks.start.mockRejectedValue(
      new APIError({ code: 'forbidden', status: 403, message: 'cannot start: REMEDIATION_REQUIRED' }),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    render(
      <QueryClientProvider client={client}>
        <FileSubmissionWorkspace
          activity={{ activity_uuid: 'activity_a1', activity_type: 'TYPE_FILE_SUBMISSION' } as Activity}
          course={{ course_uuid: 'course_c1' } as CourseStructure}
        />
      </QueryClientProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'newAttempt' }))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['remediation-sessions'] }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['file-submission', 'activity', 'a1'] })
  })

  // UX-089: a released attempt with attempts to spare offers the next one.
  it('offers «Новая попытка» after a released grade while attempts remain', async () => {
    const published = { ...draft, status: 'published', final_score: 70, late_penalty_pct: 0, feedback: '' }
    mocks.getActivity.mockResolvedValue({ ...config, max_attempts: 2, current_attempt: published, attempts: [published] })
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <FileSubmissionWorkspace
          activity={{ activity_uuid: 'activity_a1', activity_type: 'TYPE_FILE_SUBMISSION' } as Activity}
          course={{ course_uuid: 'course_c1' } as CourseStructure}
        />
      </QueryClientProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'newAttempt' }))
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith('fs-1'))
  })

  it('offers no new attempt once the cap is spent', async () => {
    const published = { ...draft, status: 'published', final_score: 70, late_penalty_pct: 0, feedback: '' }
    mocks.getActivity.mockResolvedValue({ ...config, max_attempts: 1, current_attempt: published, attempts: [published] })
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <FileSubmissionWorkspace
          activity={{ activity_uuid: 'activity_a1', activity_type: 'TYPE_FILE_SUBMISSION' } as Activity}
          course={{ course_uuid: 'course_c1' } as CourseStructure}
        />
      </QueryClientProvider>,
    )
    await screen.findByText('yourScore')
    expect(screen.queryByRole('button', { name: 'newAttempt' })).toBeNull()
  })
})
