/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

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
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
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

vi.mock('@/features/file-submissions/services/file-submissions', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/file-submissions/services/file-submissions')>()
  return {
    ...actual,
    getFileSubmissionByActivity: (...args: unknown[]) => mocks.getActivity(...args),
    getFileSubmissionReviewQueue: (...args: unknown[]) => mocks.getQueue(...args),
    getFileSubmissionReviewAttempt: (...args: unknown[]) => mocks.getAttempt(...args),
    gradeFileSubmissionAttempt: (...args: unknown[]) => mocks.grade(...args),
    fileSubmissionExportUrl: () => '/file-submissions/export.csv',
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
})
