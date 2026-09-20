/** @vitest-environment jsdom */
// BUG-166: the deadline closes under an open file draft — the submit 403
// `cannot start: PAST_DUE` refetches the projection and the blocked card
// («Срок сдачи истёк») replaces the editor, like the quiz.
// BUG-167: a gate-mode remediation assigned while the draft is open — the
// polled sessions query surfaces the gate («Пройти исправление») over the
// editor, not only in the result state.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import FileSubmissionWorkspace from '@/features/file-submissions/student/FileSubmissionWorkspace'
import { APIError } from '@/lib/api/assertSuccess'
import type { Activity, CourseStructure } from '@components/Contexts/CourseContext'

const mocks = vi.hoisted(() => ({ getActivity: vi.fn(), submit: vi.fn(), apiJson: vi.fn(), toastError: vi.fn() }))

vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: (key: string) => key === 'PAST_DUE' }),
  useFormatter: () => ({ number: (n: number) => String(n) }),
  useLocale: () => 'ru',
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@components/ui/AppLink', () => ({ default: (props: React.ComponentProps<'a'>) => <a {...props} /> }))
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ can: () => false, user: { id: USER_ID } }) }))
vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: mocks.toastError } }))
vi.mock('@/features/content-markdown', () => ({ MarkdownContent: () => null }))
vi.mock('@/hooks/useApiError', () => ({
  useApiError: () => ({ toastApiError: vi.fn(), handleApiError: () => ({ message: '', showRetry: false }) }),
}))
vi.mock('@/features/file-submissions/services/file-submissions', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/file-submissions/services/file-submissions')>()),
  getFileSubmissionByActivity: (...args: unknown[]) => mocks.getActivity(...args),
  submitFileSubmission: (...args: unknown[]) => mocks.submit(...args),
}))

const USER_ID = '01a0910c-796a-75f5-b21c-93955233d327'
const ACTIVITY_ID = '01a091a1-0461-7a3c-9433-3920a37d67e7'

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
  due_at_unix: 1_789_000_000,
  current_attempt: draft,
  attempts: [draft],
  disabled_reasons: [],
}
const gateSession = {
  id: '01a09221-0965-74e3-b175-041d6f27992e',
  submission_id: null,
  file_submission_attempt_id: 'att-0',
  activity_id: ACTIVITY_ID,
  student_user_id: USER_ID,
  analysis_id: null,
  run_id: null,
  status: 'assigned',
  gate_mode: true,
  language: 'ru',
  lecture: {
    title: 'Повторение',
    micro_lecture_markdown: 'Ещё раз про отчёты.',
    learning_objectives: [],
    citations: [],
  },
  test: { questions: [] },
  score: null,
  passed_at_unix: null,
  created_at_unix: 1_789_000_000,
  updated_at_unix: 1_789_000_000,
}

function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <FileSubmissionWorkspace
        activity={{ activity_uuid: `activity_${ACTIVITY_ID}`, activity_type: 'TYPE_FILE_SUBMISSION' } as Activity}
        course={{ course_uuid: 'course_c1' } as CourseStructure}
      />
    </QueryClientProvider>,
  )
  return client
}

beforeEach(() => {
  mocks.getActivity.mockReset().mockResolvedValue(config)
  mocks.submit.mockReset()
  mocks.apiJson.mockReset().mockResolvedValue([])
  mocks.toastError.mockReset()
})

describe('FileSubmissionWorkspace blocked states', () => {
  it('BUG-166: a PAST_DUE submit 403 refetches and shows the blocked card instead of the editor', async () => {
    mocks.submit.mockRejectedValue(new APIError({ code: 'forbidden', status: 403, message: 'cannot start: PAST_DUE' }))
    mocks.getActivity.mockResolvedValueOnce(config).mockResolvedValue({ ...config, disabled_reasons: ['PAST_DUE'] })
    renderWorkspace()
    fireEvent.click(await screen.findByRole('button', { name: 'submitFiles' }))
    await screen.findByTestId('file-submission-blocked')
    expect(screen.getByText('PAST_DUE')).toBeTruthy()
    expect(mocks.toastError).toHaveBeenCalledWith('PAST_DUE')
    expect(screen.queryByRole('button', { name: 'submitFiles' })).toBeNull()
    expect(mocks.getActivity).toHaveBeenCalledTimes(2)
  })

  it('UX-115: an open draft polls the projection, so a closed deadline flips to the blocked card without a save', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      mocks.getActivity.mockResolvedValueOnce(config).mockResolvedValue({ ...config, disabled_reasons: ['PAST_DUE'] })
      renderWorkspace()
      await screen.findByRole('button', { name: 'submitFiles' })
      await vi.advanceTimersByTimeAsync(15_500)
      await screen.findByTestId('file-submission-blocked')
      expect(screen.queryByRole('button', { name: 'submitFiles' })).toBeNull()
      expect(mocks.submit).not.toHaveBeenCalled()
      expect(mocks.getActivity).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('BUG-167: a gate seen by the sessions query replaces the open draft editor with «Пройти исправление»', async () => {
    mocks.apiJson.mockImplementation(async (path: string) =>
      path === `ai/remediation/student/${USER_ID}` ? [gateSession] : [],
    )
    renderWorkspace()
    await screen.findByTestId('remediation-gate')
    expect(screen.getByRole('button', { name: 'open' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'submitFiles' })).toBeNull()
    await waitFor(() =>
      expect(mocks.apiJson).toHaveBeenCalledWith(`ai/remediation/student/${USER_ID}`, undefined, expect.any(Function)),
    )
  })
})
