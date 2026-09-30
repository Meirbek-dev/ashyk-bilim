/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { APIError } from '@/lib/api/assertSuccess'
import FileSubmissionReviewWorkspace from '@/features/file-submissions/review/FileSubmissionReviewWorkspace'
import type {
  FileSubmissionAttempt,
  FileSubmissionReviewItem,
} from '@/features/file-submissions/services/file-submissions'

const mocks = vi.hoisted(() => ({
  getActivity: vi.fn(),
  getQueue: vi.fn(),
  getAttempt: vi.fn(),
  grade: vi.fn(),
  replace: vi.fn(),
  toastSuccess: vi.fn(),
  downloadCsv: vi.fn(),
  toastWarning: vi.fn(),
  user: null as { id: string } | null,
}))

vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ user: mocks.user }) }))

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    warning: (...args: unknown[]) => mocks.toastWarning(...args),
    error: vi.fn(),
  },
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'kk-KZ',
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ number: (n: number) => String(n) }),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/dash/courses/course/activity/activity/review',
  useRouter: () => ({ replace: mocks.replace }),
}))

vi.mock('@/features/content-markdown', () => ({
  MarkdownEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea aria-label="feedback" value={value} onChange={event => onChange(event.target.value)} />
  ),
}))

/** The AI entry (mounted on the attempt) has its own tests; it is not what this file exercises. */
vi.mock('@/features/submission-analysis', () => ({ SubmissionAIEntry: () => null }))

vi.mock('@/features/file-submissions/services/file-submissions', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/file-submissions/services/file-submissions')>()
  return {
    ...actual,
    getFileSubmissionByActivity: (...args: unknown[]) => mocks.getActivity(...args),
    getFileSubmissionReviewQueue: (...args: unknown[]) => mocks.getQueue(...args),
    getFileSubmissionReviewAttempt: (...args: unknown[]) => mocks.getAttempt(...args),
    gradeFileSubmissionAttempt: (...args: unknown[]) => mocks.grade(...args),
    downloadFileSubmissionCsv: (...args: unknown[]) => mocks.downloadCsv(...args),
  }
})

function attempt(id: string, name: string, score: number, feedback: string): FileSubmissionAttempt {
  return {
    id,
    status: 'graded',
    attempt_number: 1,
    files: [],
    is_late: false,
    late_penalty_pct: 0,
    final_score: score,
    feedback,
    rubric_scores: {},
    version: 1,
    submitted_at_unix: 1_783_933_200,
    created_at_unix: 1_783_929_600,
    updated_at_unix: 1_783_933_200,
    user: {
      id: `user_${name.toLowerCase()}`,
      username: name.toLowerCase(),
      display_name: `${name} Learner`,
      email: `${name.toLowerCase()}@example.test`,
    },
  }
}

/** The review queue carries summaries; the full attempt comes from `GET file-submission-attempts/{id}`. */
function queueItem(full: FileSubmissionAttempt): FileSubmissionReviewItem {
  const { files, feedback: _feedback, rubric_scores: _rubric, ...rest } = full
  return { ...rest, user: full.user!, file_count: files.length }
}

describe('file submission review workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.user = null
    const first = attempt('attempt_first', 'Aruzhan', 92, 'First learner feedback')
    const second = attempt('attempt_second', 'Dias', 64, 'Second learner feedback')
    mocks.getActivity.mockResolvedValue({
      id: 'file_submission_1',
      title: 'Portfolio',
      rubric: {},
    })
    mocks.getQueue.mockResolvedValue({ items: [queueItem(first), queueItem(second)], next_cursor: null })
    mocks.getAttempt.mockImplementation(async (id: string) => (id === first.id ? first : second))
  })

  it('recreates the grade editor from the newly selected attempt', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <FileSubmissionReviewWorkspace activityUuid="activity_1" />
      </QueryClientProvider>,
    )

    expect(await screen.findByDisplayValue('92')).not.toBeNull()
    expect(screen.getByDisplayValue('First learner feedback')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Dias Learner/i }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('64')).not.toBeNull()
      expect(screen.getByDisplayValue('Second learner feedback')).not.toBeNull()
    })
    expect(screen.queryByDisplayValue('First learner feedback')).toBeNull()
  })

  // UX-105 (mirrors the quiz review): an unknown `?submission=` toasts and is
  // dropped from the URL; the CSV button toasts «CSV сохранён».
  it('drops an unknown ?submission= with a notice and toasts the CSV download', async () => {
    mocks.getAttempt.mockImplementation(async (id: string) => {
      if (id === 'attempt_ghost') throw new APIError({ code: 'not-found', message: 'not found', status: 404 })
      return attempt('attempt_first', 'Aruzhan', 92, 'First learner feedback')
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <FileSubmissionReviewWorkspace activityUuid="activity_1" initialAttemptUuid="attempt_ghost" />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(mocks.toastWarning).toHaveBeenCalledWith('unknownSubmissionParam'))
    expect(mocks.replace).toHaveBeenCalledWith('/dash/courses/course/activity/activity/review', { scroll: false })
    expect(await screen.findByDisplayValue('92')).not.toBeNull()

    // UX-113: the CSV goes through the localized fetch (page locale, bytes untouched).
    const csv = new Blob(['﻿Студент'])
    mocks.downloadCsv.mockResolvedValue(csv)
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:csv')
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: 'downloadCsv' }))
    expect(mocks.downloadCsv).toHaveBeenCalledWith('file_submission_1', 'kk-KZ')
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('csvSaved'))
    expect(createObjectURL).toHaveBeenCalledWith(csv)
    click.mockRestore()
  })

  it('requires confirmation before discarding an edited learner draft', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <FileSubmissionReviewWorkspace activityUuid="activity_1" />
      </QueryClientProvider>,
    )

    const feedback = await screen.findByDisplayValue('First learner feedback')
    fireEvent.change(feedback, { target: { value: 'Unsaved feedback' } })
    fireEvent.click(screen.getByRole('button', { name: /Dias Learner/i }))

    expect(screen.getByRole('alertdialog')).not.toBeNull()
    expect(screen.getByDisplayValue('92')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'discardAndSwitch' }))
    await waitFor(() => expect(screen.getByDisplayValue('64')).not.toBeNull())
  })

  // UX-047: the score field validates inline (server rules: 0..=100, required
  // for save/publish) and each action has its own toast.
  it('flags an out-of-range score on the field and toasts what was saved', async () => {
    mocks.grade.mockImplementation(async () => attempt('attempt_first', 'Aruzhan', 95, 'First learner feedback'))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <FileSubmissionReviewWorkspace activityUuid="activity_1" />
      </QueryClientProvider>,
    )

    const score = await screen.findByDisplayValue('92')
    fireEvent.change(score, { target: { value: '101' } })
    expect(score).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('scoreInvalid')
    fireEvent.click(screen.getByRole('button', { name: 'saveGrade' }))
    expect(mocks.grade).not.toHaveBeenCalled()

    fireEvent.change(score, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'publishResult' }))
    expect(screen.getByRole('alert')).toHaveTextContent('scoreRequired')
    expect(mocks.grade).not.toHaveBeenCalled()

    fireEvent.change(score, { target: { value: '95' } })
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'saveGrade' }))
    await waitFor(() => expect(mocks.grade).toHaveBeenCalledTimes(1))
    expect(mocks.grade.mock.calls[0]?.[1]).toMatchObject({ action: 'save', final_score: 95 })
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('draftSaved'))
  })

  // BUG-154: a colleague's save (SSE refetch) or our own 412 must not be
  // overwritten by the local draft — the notice blocks the actions until the
  // teacher picks a version, and `If-Match` carries the version chosen.
  it('blocks the actions when a colleague saves over a dirty draft and sends the chosen version', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <FileSubmissionReviewWorkspace activityUuid="activity_1" />
      </QueryClientProvider>,
    )
    const feedback = await screen.findByDisplayValue('First learner feedback')
    fireEvent.change(feedback, { target: { value: 'my draft' } })

    const theirs = { ...attempt('attempt_first', 'Aruzhan', 66, 'their feedback'), version: 5 }
    mocks.getAttempt.mockResolvedValue(theirs)
    await queryClient.invalidateQueries({ queryKey: ['file-submission', 'review-attempt', 'attempt_first'] })

    await screen.findByText('staleDraftTitle')
    expect(screen.getByDisplayValue('my draft')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'saveGrade' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'publishResult' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'returnForRevision' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'keepMyDraft' }))
    expect(screen.queryByText('staleDraftTitle')).toBeNull()
    // A 412 (someone saved again) routes through the same notice; «load
    // theirs» reseeds the editor from the refetched attempt.
    mocks.grade.mockRejectedValueOnce(new APIError({ code: 'precondition-failed', message: 'stale', status: 412 }))
    mocks.getAttempt.mockResolvedValue({ ...theirs, version: 6 })
    fireEvent.click(screen.getByRole('button', { name: 'publishResult' }))
    await waitFor(() => expect(mocks.grade).toHaveBeenCalledTimes(1))
    expect(mocks.grade.mock.calls[0]?.[2]).toBe(5)
    expect(mocks.grade.mock.calls[0]?.[1]).toMatchObject({ feedback: 'my draft' })

    await screen.findByText('staleDraftTitle')
    expect(screen.getByDisplayValue('my draft')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'useServerValues' }))
    expect(screen.getByDisplayValue('their feedback')).not.toBeNull()
    expect(screen.getByDisplayValue('66')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'saveGrade' })).toBeEnabled()
  })

  // UX-065: a released grade is final (BUG-128) — save/return are disabled with a hint.
  it('offers only a re-publish on a published attempt', async () => {
    const released: FileSubmissionAttempt = {
      ...attempt('attempt_first', 'Aruzhan', 92, 'First learner feedback'),
      status: 'published',
    }
    mocks.getQueue.mockResolvedValue({ items: [queueItem(released)], next_cursor: null })
    mocks.getAttempt.mockResolvedValue(released)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <FileSubmissionReviewWorkspace activityUuid="activity_1" />
      </QueryClientProvider>,
    )

    await screen.findByDisplayValue('92')
    expect(screen.getByText('publishedIsFinal')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'saveGrade' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'returnForRevision' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'publishResult' })).toBeEnabled()
  })

  // UX-199 (mirrors UX-193): the viewer's own attempt is marked, every grading
  // action is disabled and the reason is shown.
  it("marks the viewer's own attempt and disables grading with the reason", async () => {
    mocks.user = { id: 'user_aruzhan' }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <FileSubmissionReviewWorkspace activityUuid="activity_1" />
      </QueryClientProvider>,
    )

    await screen.findByDisplayValue('92')
    expect(screen.getAllByText('ownAttempt')).toHaveLength(2)
    expect(screen.getByText('grade-own-attempt')).toBeInTheDocument()
    for (const name of ['saveGrade', 'returnForRevision', 'publishResult']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
  })

  // UX-123: the form holds the raw score; a late attempt shows what the
  // learner will get next to it, and the line follows the typed value.
  it('previews the late penalty next to the raw score', async () => {
    const late: FileSubmissionAttempt = {
      ...attempt('attempt_first', 'Aruzhan', 64, 'Late but fine'),
      is_late: true,
      late_penalty_pct: 20,
      raw_score: 80,
    }
    mocks.getQueue.mockResolvedValue({ items: [queueItem(late)], next_cursor: null })
    mocks.getAttempt.mockResolvedValue(late)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <FileSubmissionReviewWorkspace activityUuid="activity_1" />
      </QueryClientProvider>,
    )

    const input = await screen.findByDisplayValue('80')
    expect(screen.getByTestId('late-penalty-preview')).toHaveTextContent('latePenaltyPreview')
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.queryByTestId('late-penalty-preview')).toBeNull()
  })
})
