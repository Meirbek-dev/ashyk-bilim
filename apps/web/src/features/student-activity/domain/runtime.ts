import type { ActivityProgressCell } from '@/features/grading/domain';

export type StudentActivityState =
  | 'not_started'
  | 'in_progress'
  | 'viewed'
  | 'draft'
  | 'submitted'
  | 'needs_grading'
  | 'graded_hidden'
  | 'published'
  | 'returned'
  | 'passed'
  | 'failed'
  | 'complete'
  | 'locked'
  | 'unavailable'
  | 'attempt_exhausted'
  | 'course_end';

export type StudentPrimaryActionId =
  | 'start'
  | 'continue'
  | 'mark_complete'
  | 'unmark_complete'
  | 'submit'
  | 'view_receipt'
  | 'view_feedback'
  | 'revise'
  | 'next_activity'
  | 'review_policy'
  | 'back_to_course'
  | 'none';

export interface StudentPrimaryAction {
  id: StudentPrimaryActionId;
  enabled: boolean;
  reason?: string;
  targetActivityUuid?: string | null;
}

export interface StudentActivityProgressRuntime {
  state: StudentActivityState;
  complete: boolean;
  score?: number | null;
  passed?: boolean | null;
  dueAt?: string | null;
  isLate: boolean;
  teacherActionRequired: boolean;
  attemptCount: number;
  latestSubmissionUuid?: string | null;
}

export interface StudentVisiblePolicy {
  dueAt?: string | null;
  maxAttempts?: number | null;
  passingScore?: number | null;
  gradeReleaseMode?: string | null;
  completionRule?: string | null;
}

export function normalizeActivityProgress(cell?: ActivityProgressCell | null): StudentActivityProgressRuntime {
  if (!cell) {
    return {
      state: 'not_started',
      complete: false,
      isLate: false,
      teacherActionRequired: false,
      attemptCount: 0,
    };
  }

  const state = normalizeProgressState(cell.state, cell);
  return {
    state,
    complete: state === 'complete' || state === 'passed' || Boolean(cell.completed_at),
    score: cell.score,
    passed: cell.passed,
    dueAt: cell.due_at,
    isLate: cell.is_late,
    teacherActionRequired: cell.teacher_action_required,
    attemptCount: cell.attempt_count,
    latestSubmissionUuid: cell.latest_submission_uuid,
  };
}

export function normalizeProgressState(
  state: ActivityProgressCell['state'] | undefined,
  cell?: Pick<ActivityProgressCell, 'latest_submission_status' | 'passed' | 'completed_at'> | null,
): StudentActivityState {
  if (cell?.completed_at && (!state || state === 'NOT_STARTED' || state === 'IN_PROGRESS' || state === 'COMPLETED')) {
    return 'complete';
  }
  switch (state) {
    case 'IN_PROGRESS': {
      return 'in_progress';
    }
    case 'SUBMITTED': {
      return 'submitted';
    }
    case 'NEEDS_GRADING': {
      return 'needs_grading';
    }
    case 'RETURNED': {
      return 'returned';
    }
    case 'GRADED': {
      return 'graded_hidden';
    }
    case 'PASSED': {
      return 'passed';
    }
    case 'FAILED': {
      return 'failed';
    }
    case 'COMPLETED': {
      return 'complete';
    }
    default: {
      if (cell?.latest_submission_status === 'PUBLISHED') return cell.passed === false ? 'failed' : 'published';
      return 'not_started';
    }
  }
}

export function derivePrimaryAction(options: {
  state: StudentActivityState;
  canMarkComplete: boolean;
  currentComplete: boolean;
  hasNext: boolean;
  isAssessable: boolean;
  isCourseEnd: boolean;
  nextActivityUuid?: string | null;
}): StudentPrimaryAction {
  if (options.isCourseEnd) return { id: 'back_to_course', enabled: true };
  if (options.state === 'unavailable' || options.state === 'locked') {
    return { id: 'none', enabled: false, reason: options.state };
  }
  if (options.state === 'returned') return { id: 'revise', enabled: true };
  if (options.state === 'published' || options.state === 'passed' || options.state === 'failed') {
    return { id: 'view_feedback', enabled: true };
  }
  if (options.state === 'submitted' || options.state === 'needs_grading') {
    return { id: 'view_receipt', enabled: true };
  }
  if (options.state === 'graded_hidden') return { id: 'review_policy', enabled: true };
  if (options.isAssessable) {
    return { id: options.state === 'in_progress' || options.state === 'draft' ? 'continue' : 'start', enabled: true };
  }
  if (options.currentComplete && options.hasNext) {
    return { id: 'next_activity', enabled: true, targetActivityUuid: options.nextActivityUuid };
  }
  if (options.canMarkComplete) {
    return { id: options.currentComplete ? 'unmark_complete' : 'mark_complete', enabled: true };
  }
  return { id: 'none', enabled: false };
}
