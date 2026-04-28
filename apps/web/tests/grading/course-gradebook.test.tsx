/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CourseGradebook from '@/components/Grading/CourseGradebook';
import type { CourseGradebookResponse } from '@/types/grading';

let gradebook: CourseGradebookResponse;
let queryState: {
  data?: CourseGradebookResponse;
  error?: Error;
  isError: boolean;
  isLoading: boolean;
  refetch: () => void;
};

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => queryState,
}));

vi.mock('@/features/grading/queries/grading.query', () => ({
  courseGradebookQueryOptions: vi.fn(() => ({ queryKey: ['gradebook'] })),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

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
        activity_uuid: 'activity_assignment',
        name: 'Assignment',
        activity_type: 'TYPE_ASSIGNMENT',
        assessment_type: 'ASSIGNMENT',
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
        latest_submission_uuid: 'submission_assignment',
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
        submission_uuid: 'submission_assignment',
        student_name: 'Student One',
        activity_name: 'Assignment',
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
  };
}

describe('CourseGradebook', () => {
  beforeEach(() => {
    gradebook = baseGradebook();
    queryState = {
      data: gradebook,
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    };
  });

  it('renders matrix statuses from canonical activity progress cells', () => {
    render(<CourseGradebook courseUuid="course_gradebook" />);

    const table = screen.getByRole('table');
    expect(within(table).getByText('Assignment')).toBeInTheDocument();
    expect(within(table).getByText('Quiz')).toBeInTheDocument();
    expect(within(table).getByText('Needs grading')).toBeInTheDocument();
    expect(within(table).getByText('Passed')).toBeInTheDocument();
    expect(within(table).getByText('Returned')).toBeInTheDocument();
  });

  it('filters learners by progress status', () => {
    render(<CourseGradebook courseUuid="course_gradebook" />);

    fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: 'NEEDS_GRADING' },
    });

    const table = screen.getByRole('table');
    expect(within(table).getByText('Student One')).toBeInTheDocument();
    expect(within(table).queryByText('Student Two')).not.toBeInTheDocument();
  });

  it('opens the selected submission from a clicked matrix cell', () => {
    render(<CourseGradebook courseUuid="course_gradebook" />);

    fireEvent.click(within(screen.getByRole('table')).getByText('Needs grading'));

    expect(screen.getByText('Activity history')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open/i })).toHaveAttribute(
      'href',
      '/dash/grading/submissions/submission_assignment',
    );
  });

  it('shows an action queue count matching cells that need teacher action', () => {
    render(<CourseGradebook courseUuid="course_gradebook" />);

    const actionCells = gradebook.cells.filter((cell) => cell.teacher_action_required && cell.latest_submission_uuid);

    expect(screen.getByText(`${actionCells.length} submissions need attention`)).toBeInTheDocument();
    expect(screen.getAllByText('Student One').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Assignment').length).toBeGreaterThan(0);
  });

  it('shows the API error instead of staying in a loading state', () => {
    queryState = {
      error: new Error('Internal Server Error'),
      isError: true,
      isLoading: false,
      refetch: vi.fn(),
    };

    render(<CourseGradebook courseUuid="course_gradebook" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Internal Server Error');
    expect(screen.queryByText('Loading gradebook...')).not.toBeInTheDocument();
  });

  it('reflects returned cells becoming resubmitted and ready for grading', () => {
    const { rerender } = render(<CourseGradebook courseUuid="course_gradebook" />);

    expect(within(screen.getByRole('table')).getByText('Returned')).toBeInTheDocument();

    gradebook = {
      ...gradebook,
      cells: gradebook.cells.map((cell) =>
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
    };
    queryState.data = gradebook;

    rerender(<CourseGradebook courseUuid="course_gradebook" />);

    expect(within(screen.getByRole('table')).queryByText('Returned')).not.toBeInTheDocument();
    expect(screen.getByText('2 submissions need attention')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByText('Needs grading')).toHaveLength(2);
  });
});
