/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ReviewBulkActionBar from '@/features/grading/review/components/ReviewBulkActionBar'
import GradeForm from '@/features/grading/review/components/GradeForm'
import type { Submission } from '@/features/grading/domain'
import { AnnotationProvider } from '@/features/grading/review/AnnotationContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mocks = vi.hoisted(() => ({
  publishAssessmentGradesMock: vi.fn(),
  createStudentPolicyOverrideMock: vi.fn(),
  exportGradesCsvMock: vi.fn(),
  saveGradeMock: vi.fn(),
  saveGradingDraftMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
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
  },
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('@/services/grading/grading', () => ({
  publishAssessmentGrades: (...args: unknown[]) => mocks.publishAssessmentGradesMock(...args),
  exportGradesCSV: (...args: unknown[]) => mocks.exportGradesCsvMock(...args),
  saveGrade: (...args: unknown[]) => mocks.saveGradeMock(...args),
}))

vi.mock('@/services/assessments/assessment-actions', () => ({
  createStudentPolicyOverride: (...args: unknown[]) =>
    mocks.createStudentPolicyOverrideMock(...args),
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
    id: 1,
    submission_uuid: 'submission_review',
    user_id: 9,
    activity_id: 42,
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
      id: 9,
      user_uuid: 'user_student',
      username: 'student',
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
    mocks.createStudentPolicyOverrideMock.mockResolvedValue({ id: 1 })
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

    fireEvent.click(within(dialog).getByRole('button', { name: 'confirmPublish' }))

    await waitFor(() => {
      expect(mocks.saveGradeMock).toHaveBeenCalledTimes(2)
    })
    expect(mocks.saveGradeMock).toHaveBeenNthCalledWith(
      1,
      'submission_ready',
      {
        final_score: 91,
        feedback: 'Solid work.',
        status: 'PUBLISHED',
        item_feedback: [],
      },
      3,
      'assessment_review',
    )
    expect(mocks.saveGradeMock).toHaveBeenNthCalledWith(
      2,
      'submission_visible',
      {
        final_score: 77,
        feedback: 'Solid work.',
        status: 'PUBLISHED',
        item_feedback: [],
      },
      3,
      'assessment_review',
    )
    expect(mocks.toastSuccessMock).toHaveBeenCalledWith('toasts.published')
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('summaries.publishFinished')).toBeInTheDocument()
  })

  it('shows deadline extension preview and queues the selected learner override', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(
      <ReviewBulkActionBar
        activityId={77}
        assessmentUuid="assessment_review"
        disabled={false}
        onRefresh={onRefresh}
        submissions={[
          createSubmission({
            user: {
              id: 9,
              user_uuid: 'user_a',
              username: 'student.a',
              first_name: 'A',
              last_name: 'Student',
              email: 'a@example.test',
            },
          }),
          createSubmission({
            submission_uuid: 'submission_two',
            user: {
              id: 10,
              user_uuid: 'user_b',
              username: 'student.b',
              first_name: 'B',
              last_name: 'Student',
              email: 'b@example.test',
            },
          }),
        ]}
      />,
    )

    const dueAtInput = document.querySelector('input[type="datetime-local"]')
    expect(dueAtInput).not.toBeNull()
    fireEvent.change(dueAtInput!, { target: { value: '2026-05-10T14:30' } })
    fireEvent.change(screen.getByPlaceholderText('reasonPlaceholder'), {
      target: { value: 'Medical extension' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'extend' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('dialogs.extendTitle')).toBeInTheDocument()
    expect(within(dialog).getByText('Medical extension')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'queueExtension' }))

    await waitFor(() => {
      expect(mocks.createStudentPolicyOverrideMock).toHaveBeenCalledTimes(2)
    })
    expect(mocks.createStudentPolicyOverrideMock).toHaveBeenNthCalledWith(1, 'assessment_review', {
      user_id: 9,
      due_at_override: new Date('2026-05-10T14:30').toISOString(),
      note: 'Medical extension',
    })
    expect(mocks.toastSuccessMock).toHaveBeenCalledWith('toasts.deadlineQueued')
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

  it('explains already visible grades and keeps publish disabled after release', () => {
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
    expect(screen.getByRole('button', { name: 'publishGrade' })).toBeDisabled()
  })
})
