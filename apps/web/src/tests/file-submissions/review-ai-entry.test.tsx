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
  aiEntry: vi.fn(),
}))

vi.mock('next-intl', () => ({
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

/** The AI entry is exercised on its own wire in `tests/ai`; here only the mount contract matters. */
vi.mock('@/features/submission-analysis', () => ({
  SubmissionAIEntry: (props: { submissionUuid: string | null; onDraftFeedback?: (feedback: string) => void }) => {
    mocks.aiEntry(props.submissionUuid)
    return (
      <button type="button" onClick={() => props.onDraftFeedback?.('AI draft for the feedback box')}>
        ai-draft-feedback
      </button>
    )
  },
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

const ATTEMPT_ID = '01a0a2b0-1b1c-7c2d-8e3f-4a5b6c7d8e9f'

function attempt(): FileSubmissionAttempt {
  return {
    id: ATTEMPT_ID,
    status: 'submitted',
    attempt_number: 1,
    files: [],
    is_late: false,
    late_penalty_pct: 0,
    final_score: null,
    feedback: '',
    rubric_scores: {},
    version: 3,
    submitted_at_unix: 1_783_933_200,
    created_at_unix: 1_783_929_600,
    updated_at_unix: 1_783_933_200,
    user: {
      id: 'user_aruzhan',
      username: 'aruzhan',
      display_name: 'Aruzhan Learner',
      email: 'aruzhan@example.test',
    },
  }
}

function queueItem(full: FileSubmissionAttempt): FileSubmissionReviewItem {
  const { files, feedback: _feedback, rubric_scores: _rubric, ...rest } = full
  return { ...rest, user: full.user!, file_count: files.length }
}

describe('file-submission review: AI analysis on the attempt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const first = attempt()
    mocks.getActivity.mockResolvedValue({ id: 'file_submission_1', title: 'Portfolio', rubric: {} })
    mocks.getQueue.mockResolvedValue({ items: [queueItem(first)], next_cursor: null })
    mocks.getAttempt.mockResolvedValue(first)
  })

  it('mounts the analyst on the attempt id and pastes its draft into the feedback box', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <FileSubmissionReviewWorkspace activityUuid="activity_1" />
      </QueryClientProvider>,
    )

    // `ai/submission-analysis/{id}` takes the file attempt id (DECISIONS 2026-09-12).
    await waitFor(() => expect(mocks.aiEntry).toHaveBeenCalledWith(ATTEMPT_ID))

    fireEvent.click(screen.getByText('ai-draft-feedback'))
    await waitFor(() => {
      expect(screen.getByDisplayValue('AI draft for the feedback box')).not.toBeNull()
    })
  })
})
