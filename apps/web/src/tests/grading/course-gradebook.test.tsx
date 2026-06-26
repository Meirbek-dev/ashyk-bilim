/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import CourseGradebookCommandCenter from '@/features/grading/gradebook/CourseGradebookCommandCenter'
import type { CourseGradebookResponse } from '@/types/grading'

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}))
const gradingQueryMocks = vi.hoisted(() => ({
  courseGradebookQueryOptions: vi.fn(() => ({ queryKey: ['gradebook'] })),
  courseGradebookExportUrl: vi.fn(() => '/api/grading/courses/course_gradebook/gradebook/export'),
}))

let gradebook: CourseGradebookResponse
let queryState: {
  data?: CourseGradebookResponse
  error?: Error
  isError: boolean
  isLoading: boolean
  refetch: () => void
}

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => queryState,
}))

vi.mock('@/features/grading/queries/grading.query', () => ({
  courseGradebookExportUrl: gradingQueryMocks.courseGradebookExportUrl,
  courseGradebookQueryOptions: gradingQueryMocks.courseGradebookQueryOptions,
}))

vi.mock('@/features/assessments/registry', () => ({
  loadKindModule: vi.fn(async () => ({ ReviewDetail: undefined })),
}))

vi.mock('@/features/grading/review/GradingReviewWorkspace', () => ({
  default: ({
    initialSubmissionUuid,
    activityId,
    activityUuid,
    initialFilter,
  }: {
    initialSubmissionUuid: string
    activityId: number
    activityUuid?: string
    initialFilter?: string
  }) => (
    <div>
      review:{initialSubmissionUuid}:{activityId}:{activityUuid}:{initialFilter}
    </div>
  ),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values?.count === undefined ? key : `${key}:${values.count}`,
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/dash/courses/course_gradebook/gradebook',
  useRouter: () => navigationMocks,
  useSearchParams: () => navigationMocks.searchParams,
}))

function baseGradebook(): CourseGradebookResponse {
  return {
    course_uuid: 'course_gradebook',
    course_id: 1,
    course_name: 'Course',
    students: [
      {
        id: 10,
        user_uuid: 'user_student_one',
        username: 'student.one',
        first_name: 'Student',
        last_name: 'One',
        email: 'student.one@example.com',
      },
      {
        id: 11,
        user_uuid: 'user_student_two',
        username: 'student.two',
        first_name: 'Student',
        last_name: 'Two',
        email: 'student.two@example.com',
      },
    ],
    activities: [
      {
        id: 1,
        activity_uuid: 'activity_manual_assessment',
        name: 'ManualAssessment',
        activity_type: 'TYPE_FILE_SUBMISSION',
        assessment_type: 'EXAM',
        order: 1,
      },
      {
        id: 2,
        activity_uuid: 'activity_quiz',
        name: 'Quiz',
        activity_type: 'TYPE_DYNAMIC',
        assessment_type: 'QUIZ',
        order: 2,
      },
    ],
    cells: [
      {
        user_id: 10,
        activity_id: 1,
        state: 'NEEDS_GRADING',
        score: null,
        passed: null,
        is_late: true,
        teacher_action_required: true,
        attempt_count: 2,
        latest_submission_uuid: 'submission_manual_assessment',
        latest_submission_status: 'PENDING',
        submitted_at: '2026-01-02T10:00:00Z',
        due_at: '2026-01-01T10:00:00Z',
      },
      {
        user_id: 10,
        activity_id: 2,
        state: 'PASSED',
        score: 88,
        passed: true,
        is_late: false,
        teacher_action_required: false,
        attempt_count: 1,
        latest_submission_uuid: 'submission_quiz',
        latest_submission_status: 'PUBLISHED',
      },
      {
        user_id: 11,
        activity_id: 1,
        state: 'NOT_STARTED',
        is_late: false,
        teacher_action_required: false,
        attempt_count: 0,
      },
      {
        user_id: 11,
        activity_id: 2,
        state: 'RETURNED',
        score: 45,
        passed: false,
        is_late: false,
        teacher_action_required: false,
        attempt_count: 1,
        latest_submission_uuid: 'submission_returned',
        latest_submission_status: 'RETURNED',
      },
    ],
    teacher_actions: [
      {
        action_type: 'GRADE_SUBMISSION',
        user_id: 10,
        activity_id: 1,
        submission_uuid: 'submission_manual_assessment',
        student_name: 'Student One',
        activity_name: 'ManualAssessment',
        submitted_at: '2026-01-02T10:00:00Z',
        is_late: true,
      },
    ],
    summary: {
      student_count: 2,
      activity_count: 2,
      needs_grading_count: 1,
      overdue_count: 1,
      not_started_count: 1,
      completed_count: 1,
    },
  }
}

describe('CourseGradebookCommandCenter', () => {
  beforeEach(() => {
    gradebook = baseGradebook()
    queryState = {
      data: gradebook,
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    }
    navigationMocks.push.mockClear()
    navigationMocks.replace.mockClear()
    navigationMocks.searchParams = new URLSearchParams()
    gradingQueryMocks.courseGradebookQueryOptions.mockClear()
    gradingQueryMocks.courseGradebookExportUrl.mockClear()
  })

  it('renders matrix statuses from canonical activity progress cells', () => {
    render(<CourseGradebookCommandCenter courseUuid="course_gradebook" />)

    const table = screen.getByRole('table')
    expect(within(table).getByText('ManualAssessment')).toBeInTheDocument()
    expect(within(table).getByText('states.needs_grading')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'savedFilters.all' }))

    expect(within(table).getByText('Quiz')).toBeInTheDocument()
    expect(within(table).getByText('states.passed')).toBeInTheDocument()
    expect(within(table).getByText('states.returned')).toBeInTheDocument()
  })

  it('requests a server-paginated gradebook using URL filters', () => {
    navigationMocks.searchParams = new URLSearchParams(
      'search=student&activityType=TYPE_DYNAMIC&filter=returned&page=2',
    )

    render(<CourseGradebookCommandCenter courseUuid="course_gradebook" />)

    expect(gradingQueryMocks.courseGradebookQueryOptions).toHaveBeenCalledWith('course_gradebook', {
      activityType: 'TYPE_DYNAMIC',
      page: 2,
      pageSize: 100,
      savedFilter: 'returned',
      search: 'student',
    })
  })

  it('filters learners by saved progress filters', () => {
    render(<CourseGradebookCommandCenter courseUuid="course_gradebook" />)

    fireEvent.click(screen.getByRole('button', { name: 'savedFilters.not_started' }))

    const table = screen.getByRole('table')
    expect(within(table).queryByText('Student One')).not.toBeInTheDocument()
    expect(within(table).getByText('Student Two')).toBeInTheDocument()
    expect(navigationMocks.replace).toHaveBeenCalledWith(
      '/dash/courses/course_gradebook/gradebook?filter=not_started',
      { scroll: false },
    )
  })

  it('updates the URL when moving between server pages', () => {
    gradebook = {
      ...gradebook,
      page_info: {
        page: 1,
        page_size: 1,
        total_students: 2,
        total_activities: 2,
        has_previous: false,
        has_next: true,
        activity_types: ['TYPE_DYNAMIC', 'TYPE_FILE_SUBMISSION'],
      },
    }
    queryState.data = gradebook

    render(<CourseGradebookCommandCenter courseUuid="course_gradebook" />)

    fireEvent.click(screen.getByRole('button', { name: 'nextPage' }))

    expect(navigationMocks.replace).toHaveBeenCalledWith('/dash/courses/course_gradebook/gradebook?page=2', {
      scroll: false,
    })
  })

  it('opens the shared review workspace from a clicked matrix cell', () => {
    render(<CourseGradebookCommandCenter courseUuid="course_gradebook" />)

    fireEvent.click(within(screen.getByRole('table')).getByText('states.needs_grading'))

    expect(navigationMocks.push).toHaveBeenCalledWith(
      '/dash/courses/gradebook/activity/manual_assessment/review?submission=submission_manual_assessment',
    )
  })

  it('shows command-center rollups and summary counts', () => {
    render(<CourseGradebookCommandCenter courseUuid="course_gradebook" />)

    const actionCells = gradebook.cells.filter(cell => cell.teacher_action_required && cell.latest_submission_uuid)

    expect(screen.getAllByText('summary.needsGrading').length).toBeGreaterThan(0)
    expect(screen.getAllByText(String(actionCells.length)).length).toBeGreaterThan(0)
    expect(screen.getByText('rollups.title')).toBeInTheDocument()
  })

  it('shows the API error instead of staying in a loading state', () => {
    queryState = {
      error: new Error('Internal Server Error'),
      isError: true,
      isLoading: false,
      refetch: vi.fn(),
    }

    render(<CourseGradebookCommandCenter courseUuid="course_gradebook" />)

    expect(screen.getByRole('alert')).toHaveTextContent('Internal Server Error')
    expect(screen.queryByText('loading')).not.toBeInTheDocument()
  })

  it('reflects returned cells becoming resubmitted and ready for grading', () => {
    const { rerender } = render(<CourseGradebookCommandCenter courseUuid="course_gradebook" />)

    fireEvent.click(screen.getByRole('button', { name: 'savedFilters.all' }))

    expect(within(screen.getByRole('table')).getByText('states.returned')).toBeInTheDocument()

    gradebook = {
      ...gradebook,
      cells: gradebook.cells.map(cell =>
        cell.user_id === 11 && cell.activity_id === 2
          ? {
              ...cell,
              state: 'NEEDS_GRADING',
              teacher_action_required: true,
              latest_submission_uuid: 'submission_resubmitted',
              latest_submission_status: 'PENDING',
              attempt_count: 2,
            }
          : cell,
      ),
      teacher_actions: [
        ...gradebook.teacher_actions,
        {
          action_type: 'GRADE_SUBMISSION',
          user_id: 11,
          activity_id: 2,
          submission_uuid: 'submission_resubmitted',
          student_name: 'Student Two',
          activity_name: 'Quiz',
          is_late: false,
        },
      ],
      summary: {
        ...gradebook.summary,
        needs_grading_count: 2,
      },
    }
    queryState.data = gradebook

    rerender(<CourseGradebookCommandCenter courseUuid="course_gradebook" />)

    expect(within(screen.getByRole('table')).queryByText('states.returned')).not.toBeInTheDocument()
    expect(within(screen.getByRole('table')).getAllByText('states.needs_grading')).toHaveLength(2)
  })
})
