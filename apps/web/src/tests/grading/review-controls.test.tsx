/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import ReviewBulkActionBar from '@/features/grading/review/components/ReviewBulkActionBar'
import GradeForm from '@/features/grading/review/components/GradeForm'
import type { Submission } from '@/features/grading/domain'
import { AnnotationProvider } from '@/features/grading/review/AnnotationContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mocks = vi.hoisted(() => ({
  publishAssessmentGradesMock: vi.fn(),
  extendDeadlineMock: vi.fn(),
  getBulkActionMock: vi.fn(),
  exportGradesCsvMock: vi.fn(),
  saveGradeMock: vi.fn(),
  saveGradingDraftMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastWarningMock: vi.fn(),
  mutateMock: vi.fn().mockResolvedValue(undefined),
  gradingPanelState: {
    submission: null as Submission | null,
    isLoading: false,
  },
}))

function installLocalStorageMock() {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value)
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key)
      }),
      clear: vi.fn(() => {
        store.clear()
      }),
    },
  })
}

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccessMock,
    error: mocks.toastErrorMock,
    warning: mocks.toastWarningMock,
  },
}))

vi.mock('@/hooks/useApiError', () => ({
  useApiError: () => ({
    handleApiError: (error: unknown) => ({ message: error instanceof Error ? error.message : 'unknown' }),
  }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
  useFormatter: () => ({ number: (value: number) => String(value), dateTime: (value: Date) => value.toISOString() }),
}))

vi.mock('@/services/grading/grading', () => ({
  publishAssessmentGrades: (...args: unknown[]) => mocks.publishAssessmentGradesMock(...args),
  exportGradesCSV: (...args: unknown[]) => mocks.exportGradesCsvMock(...args),
}))

// Bulk rows and the deadline extension go straight to the API from the
// browser (problem+json codes survive, BUG-035).
vi.mock('@/lib/api/generated/grading/grading', () => ({
  saveGrade: (...args: unknown[]) => mocks.saveGradeMock(...args),
  extendDeadline: (...args: unknown[]) => mocks.extendDeadlineMock(...args),
  getBulkAction: (...args: unknown[]) => mocks.getBulkActionMock(...args),
}))

vi.mock('@/services/assessments/assessment-actions', () => ({
  saveGradingDraft: (...args: unknown[]) => mocks.saveGradingDraftMock(...args),
}))

vi.mock('@/hooks/useGradingPanel', () => ({
  useGradingPanel: () => ({
    submission: mocks.gradingPanelState.submission,
    isLoading: mocks.gradingPanelState.isLoading,
    mutate: mocks.mutateMock,
  }),
}))

function createSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: 'submission_review',
    submission_uuid: 'submission_review',
    user_id: 'user_student',
    activity_id: 'activity_review',
    status: 'GRADED',
    version: 3,
    final_score: 91,
    auto_score: 88,
    started_at: '2026-05-05T10:00:00Z',
    submitted_at: '2026-05-05T10:30:00Z',
    graded_at: '2026-05-05T11:00:00Z',
    created_at: '2026-05-05T10:00:00Z',
    updated_at: '2026-05-05T11:00:00Z',
    attempt_number: 2,
    is_late: false,
    grading_json: { feedback: 'Solid work.' },
    answers_json: {},
    metadata_json: {},
    user: {
      id: 'user_student',
      username: 'student',
      display_name: 'Student One',
      first_name: 'Student',
      last_name: 'One',
      email: 'student.one@example.test',
    },
    ...overrides,
  } as Submission
}

describe('teacher review controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installLocalStorageMock()
    globalThis.localStorage.clear()
    mocks.gradingPanelState.submission = null
    mocks.gradingPanelState.isLoading = false
    mocks.publishAssessmentGradesMock.mockResolvedValue({
      published_count: 2,
      already_published_count: 1,
    })
    mocks.extendDeadlineMock.mockResolvedValue({
      id: 'bulk_1',
      action_type: 'extend_deadline',
      status: 'completed',
      affected_count: 2,
      error_log: '',
    })
    mocks.exportGradesCsvMock.mockResolvedValue('header\nvalue')
    mocks.saveGradeMock.mockResolvedValue(createSubmission({ status: 'PUBLISHED' }))
    mocks.saveGradingDraftMock.mockResolvedValue(createSubmission({ status: 'PUBLISHED' }))
    mocks.mutateMock.mockResolvedValue(undefined)
  })

  it('shows publish preview dialog and publishes only grade-ready submissions', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(
      <ReviewBulkActionBar
        activityId={42}
        assessmentUuid="assessment_review"
        disabled={false}
        onRefresh={onRefresh}
        submissions={[
          createSubmission({
            submission_uuid: 'submission_ready',
            status: 'GRADED',
            final_score: 91,
          }),
          createSubmission({
            submission_uuid: 'submission_hidden',
            status: 'PENDING',
            final_score: null,
          }),
          createSubmission({
            submission_uuid: 'submission_visible',
            status: 'PUBLISHED',
            final_score: 77,
          }),
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'publishSelected' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('dialogs.publishTitle')).toBeInTheDocument()
    expect(within(dialog).getByText('dialogs.publishDescription')).toBeInTheDocument()
    expect(within(dialog).getByText('preview.gradeReady')).toBeInTheDocument()
    expect(within(dialog).getByText('preview.hiddenFromStudent')).toBeInTheDocument()
    expect(within(dialog).getByText('preview.alreadyVisible')).toBeInTheDocument()
    // UX-067: the ungraded row is named as skipped, not silently dropped.
    expect(within(dialog).getByText('preview.notGraded')).toBeInTheDocument()

    fireEvent.change(within(dialog).getByPlaceholderText('auditNote.placeholder'), {
      target: { value: 'Publish graded submissions' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'confirmPublish' }))

    await waitFor(() => {
      expect(mocks.saveGradeMock).toHaveBeenCalledTimes(2)
    })
    // BUG-138: publish-only — no score (the server keeps the stored raw score
    // and penalties), no feedback (kept); the note goes to the audit trail.
    expect(mocks.saveGradeMock).toHaveBeenNthCalledWith(
      1,
      'submission_ready',
      { action: 'publish', audit_note: 'Publish graded submissions' },
      { headers: { 'If-Match': '"3"' } },
    )
    expect(mocks.saveGradeMock).toHaveBeenNthCalledWith(
      2,
      'submission_visible',
      { action: 'publish', audit_note: 'Publish graded submissions' },
      { headers: { 'If-Match': '"3"' } },
    )
    expect(mocks.toastWarningMock).toHaveBeenCalledWith('toasts.publishedWithSkipped')
    expect(mocks.toastSuccessMock).not.toHaveBeenCalledWith('toasts.published')
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('summaries.publishFinished')).toBeInTheDocument()
  })

  // BUG-125: a PUBLISHED row cannot be returned — it is left out, and a
  // server refusal keeps the dialog open with the per-row error, no success badge.
  it('returns only returnable rows and keeps the dialog open when the server refuses one', async () => {
    mocks.saveGradeMock.mockRejectedValueOnce(new Error('transition-not-allowed'))
    render(
      <ReviewBulkActionBar
        activityId={42}
        assessmentUuid="assessment_review"
        disabled={false}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        submissions={[
          createSubmission({ submission_uuid: 'submission_ready', status: 'GRADED', final_score: 91 }),
          createSubmission({ submission_uuid: 'submission_visible', status: 'PUBLISHED', final_score: 77 }),
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'returnSelected' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('preview.notReturnable')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByPlaceholderText('auditNote.placeholder'), {
      target: { value: 'Return for another pass' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'confirmReturn' }))

    await waitFor(() => expect(mocks.saveGradeMock).toHaveBeenCalledTimes(1))
    expect(mocks.saveGradeMock.mock.calls[0]?.[0]).toBe('submission_ready')
    expect(await within(dialog).findByText('transition-not-allowed', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(mocks.toastWarningMock).toHaveBeenCalledWith('toasts.bulkPartialFailure')
    expect(screen.getByText('summaries.finishedWithErrors')).toBeInTheDocument()
    expect(screen.queryByText('summaries.returnFinished')).toBeNull()
  })

  it('shows deadline extension preview and runs the deadline-extensions bulk action', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 1)
    const dueDateName = new RegExp(
      `${dueDate.toLocaleString('en-US', { month: 'long' })} ${dueDate.getDate()}(?:st|nd|rd|th), ${dueDate.getFullYear()}`,
      'i',
    )
    const expectedDueAt = new Date(dueDate)
    expectedDueAt.setHours(14, 30, 0, 0)
    render(
      <ReviewBulkActionBar
        activityId={77}
        assessmentUuid="assessment_review"
        disabled={false}
        onRefresh={onRefresh}
        submissions={[
          createSubmission({
            user: {
              id: 'user_a',
              username: 'student.a',
              display_name: 'A Student',
              first_name: 'A',
              last_name: 'Student',
              email: 'a@example.test',
            },
          }),
          createSubmission({
            submission_uuid: 'submission_two',
            user: {
              id: 'user_b',
              username: 'student.b',
              display_name: 'B Student',
              first_name: 'B',
              last_name: 'Student',
              email: 'b@example.test',
            },
          }),
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'deadlinePlaceholder' }))

    const dueAtDialog = await screen.findByRole('dialog')
    fireEvent.click(within(dueAtDialog).getByRole('button', { name: dueDateName }))

    const dueAtTimeInput = dueAtDialog.querySelector('input[type="time"]')
    expect(dueAtTimeInput).not.toBeNull()
    fireEvent.change(dueAtTimeInput!, { target: { value: '14:30' } })
    fireEvent.click(within(dueAtDialog).getByRole('button', { name: /set/i }))

    fireEvent.click(screen.getByRole('button', { name: 'extend' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('dialogs.extendTitle')).toBeInTheDocument()
    // UX-066: the reason is asked for in the dialog; the date is localized, not raw ISO.
    expect(within(dialog).getByText(expectedDueAt.toISOString())).toBeInTheDocument()
    fireEvent.change(within(dialog).getByPlaceholderText('reasonPlaceholder'), {
      target: { value: 'Medical extension' },
    })

    fireEvent.click(within(dialog).getByRole('button', { name: 'queueExtension' }))

    // BUG-124: one queued bulk action, never per-learner policy overrides.
    await waitFor(() => {
      expect(mocks.extendDeadlineMock).toHaveBeenCalledTimes(1)
    })
    expect(mocks.extendDeadlineMock).toHaveBeenCalledWith('assessment_review', {
      user_ids: ['user_a', 'user_b'],
      new_due_at_unix: Math.floor(expectedDueAt.getTime() / 1000),
      reason: 'Medical extension',
    })
    await waitFor(() => expect(mocks.toastSuccessMock).toHaveBeenCalledWith('toasts.deadlineExtended'))
    expect(mocks.getBulkActionMock).not.toHaveBeenCalled()
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('shows hidden-grade release preview and summarizes the activity-wide publish result', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(
      <ReviewBulkActionBar
        activityId={55}
        assessmentUuid="assessment_review"
        disabled={false}
        onRefresh={onRefresh}
        submissions={[
          createSubmission({ submission_uuid: 'hidden_one', status: 'GRADED' }),
          createSubmission({
            submission_uuid: 'hidden_two',
            status: 'PENDING',
            final_score: null,
          }),
          createSubmission({
            submission_uuid: 'visible_one',
            status: 'PUBLISHED',
          }),
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'releaseHidden' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('dialogs.releaseTitle')).toBeInTheDocument()
    expect(within(dialog).getByText('preview.selectedHiddenSubmissions')).toBeInTheDocument()

    fireEvent.change(within(dialog).getByPlaceholderText('auditNote.placeholder'), {
      target: { value: 'Release hidden grades' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'releaseGrades' }))

    await waitFor(() => {
      expect(mocks.publishAssessmentGradesMock).toHaveBeenCalledWith('assessment_review')
    })
    expect(mocks.toastSuccessMock).toHaveBeenCalledWith('toasts.hiddenReleased')
    expect(await screen.findByText('summaries.releaseFinished')).toBeInTheDocument()
  })

  it('explains hidden grades and keeps publish disabled until the teacher saves a grade', () => {
    mocks.gradingPanelState.submission = createSubmission({
      status: 'PENDING',
      final_score: null,
      auto_score: null,
      grading_json: {
        auto_graded: false,
        needs_manual_review: false,
        feedback: '',
      },
    })

    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <AnnotationProvider>
          <GradeForm
            submissionUuid="submission_review"
            onSaved={vi.fn().mockResolvedValue(undefined)}
            navigation={{
              hasNext: false,
              hasPrevious: false,
              goNext: vi.fn(),
              goPrevious: vi.fn(),
              selectedIndex: 0,
            }}
          />
        </AnnotationProvider>
      </QueryClientProvider>,
    )

    expect(screen.getByText('releaseStateHidden')).toBeInTheDocument()
    expect(screen.getByText('publishPrerequisite')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'publishGrade' })).toBeDisabled()
    expect(screen.getByText('publishPrerequisite')).toBeInTheDocument()
  })

  // BUG-123: a colleague's save (SSE refetch) must not overwrite what the
  // grader typed; the server copy is offered behind an explicit action.
  it('keeps a dirty draft when the submission is refetched and offers the colleague version', async () => {
    mocks.gradingPanelState.submission = createSubmission({ status: 'GRADED', final_score: 91, version: 3 })
    const queryClient = new QueryClient()
    const navigation = { hasNext: false, hasPrevious: false, goNext: vi.fn(), goPrevious: vi.fn(), selectedIndex: 0 }
    // A fresh element each time — React skips a re-render of an identical element.
    const ui = () => (
      <QueryClientProvider client={queryClient}>
        <AnnotationProvider>
          <GradeForm
            submissionUuid="submission_review"
            assessmentUuid="assessment_review"
            onSaved={vi.fn().mockResolvedValue(undefined)}
            navigation={navigation}
          />
        </AnnotationProvider>
      </QueryClientProvider>
    )
    const { rerender } = render(ui())

    fireEvent.change(screen.getByLabelText('finalScore'), { target: { value: '40' } })
    mocks.gradingPanelState.submission = createSubmission({
      status: 'GRADED',
      final_score: 77,
      version: 4,
      grading_json: { feedback: 'Colleague feedback' },
    })
    rerender(ui())

    expect(screen.getByLabelText('finalScore')).toHaveValue(40)
    expect(screen.getByText('staleDraftTitle')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'useServerValues' }))
    expect(screen.getByLabelText('finalScore')).toHaveValue(77)
    expect(screen.queryByText('staleDraftTitle')).toBeNull()
  })

  // UX-049: while the notice is open nothing can be saved; «keep my draft»
  // re-bases `If-Match` on the colleague's version and the publish clears it.
  it('blocks save and publish behind the colleague notice and re-bases the version on keep', async () => {
    mocks.saveGradingDraftMock.mockResolvedValue(undefined)
    mocks.gradingPanelState.submission = createSubmission({ status: 'GRADED', final_score: 91, version: 3 })
    const queryClient = new QueryClient()
    const navigation = { hasNext: false, hasPrevious: false, goNext: vi.fn(), goPrevious: vi.fn(), selectedIndex: 0 }
    const ui = () => (
      <QueryClientProvider client={queryClient}>
        <AnnotationProvider>
          <GradeForm
            submissionUuid="submission_review"
            assessmentUuid="assessment_review"
            onSaved={vi.fn().mockResolvedValue(undefined)}
            navigation={navigation}
          />
        </AnnotationProvider>
      </QueryClientProvider>
    )
    const { rerender } = render(ui())

    fireEvent.change(screen.getByLabelText('finalScore'), { target: { value: '40' } })
    mocks.gradingPanelState.submission = createSubmission({ status: 'GRADED', final_score: 77, version: 4 })
    rerender(ui())

    expect(screen.getByText('staleDraftTitle')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'saveDraftGrade' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'publishGrade' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'returnForRevision' })).toBeDisabled()
    expect(screen.getByText('staleDraftBlocked')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'keepMyDraft' }))
    expect(screen.queryByText('staleDraftTitle')).toBeNull()
    expect(screen.getByLabelText('finalScore')).toHaveValue(40)
    expect(screen.getByRole('button', { name: 'publishGrade' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'publishGrade' }))
    await waitFor(() => {
      expect(mocks.saveGradingDraftMock).toHaveBeenLastCalledWith(
        'assessment_review',
        'submission_review',
        expect.objectContaining({ status: 'publish' }),
        4,
      )
    })
    expect(screen.queryByText('staleDraftTitle')).toBeNull()
  })

  it('explains awaiting release state and publishes student-visible grades', async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined)
    mocks.gradingPanelState.submission = createSubmission({
      status: 'GRADED',
      final_score: 94,
      version: 8,
    })

    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <AnnotationProvider>
          <GradeForm
            submissionUuid="submission_review"
            assessmentUuid="assessment_review"
            onSaved={onSaved}
            navigation={{
              hasNext: true,
              hasPrevious: true,
              goNext: vi.fn(),
              goPrevious: vi.fn(),
              selectedIndex: 0,
            }}
          />
        </AnnotationProvider>
      </QueryClientProvider>,
    )

    expect(screen.getByText('releaseStateAwaitingRelease')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'publishGrade' }))

    await waitFor(() => {
      expect(mocks.saveGradingDraftMock).toHaveBeenCalledWith(
        'assessment_review',
        'submission_review',
        {
          item_grades: [],
          overall_feedback: 'Solid work.',
          status: 'publish',
          override_score: undefined,
          final_score: undefined,
          override_reason: undefined,
        },
        8,
      )
    })
    expect(mocks.toastSuccessMock).toHaveBeenCalledWith('toasts.published')
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('explains already visible grades and offers a re-publish (PUBLISHED → PUBLISHED is the only allowed move)', () => {
    mocks.gradingPanelState.submission = createSubmission({
      status: 'PUBLISHED',
      final_score: 88,
    })

    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <AnnotationProvider>
          <GradeForm
            submissionUuid="submission_review"
            onSaved={vi.fn().mockResolvedValue(undefined)}
            navigation={{
              hasNext: false,
              hasPrevious: false,
              goNext: vi.fn(),
              goPrevious: vi.fn(),
              selectedIndex: 0,
            }}
          />
        </AnnotationProvider>
      </QueryClientProvider>,
    )

    expect(screen.getByText('releaseStateVisible')).toBeInTheDocument()
    expect(screen.getByText('republishHint')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'republishGrade' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'saveDraftGrade' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'returnForRevision' })).toBeDisabled()
    expect(screen.getByLabelText('finalScore')).toBeEnabled()
  })
})
