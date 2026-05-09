import type { ActivityProgressCell, ActivityProgressState, ReleaseState, SubmissionStatus } from './types';

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  DRAFT: 'Draft',
  PENDING: 'Awaiting grade',
  GRADED: 'Graded',
  PUBLISHED: 'Released',
  RETURNED: 'Returned',
};

export const SUBMISSION_STATUS_COLORS: Record<SubmissionStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  PENDING: 'bg-warning/10 text-warning',
  GRADED: 'bg-success/10 text-success',
  PUBLISHED: 'bg-primary/10 text-primary',
  RETURNED: 'bg-destructive/10 text-destructive',
};

export const SUBMISSION_ALLOWED_TRANSITIONS: Record<SubmissionStatus, SubmissionStatus[]> = {
  DRAFT: ['PENDING'],
  PENDING: ['GRADED', 'RETURNED'],
  GRADED: ['PUBLISHED', 'RETURNED'],
  PUBLISHED: ['GRADED', 'RETURNED'],
  RETURNED: ['PENDING'],
};

export const RELEASE_STATE_LABELS: Record<ReleaseState, string> = {
  HIDDEN: 'Hidden from student',
  AWAITING_RELEASE: 'Awaiting release',
  VISIBLE: 'Visible to student',
  RETURNED_FOR_REVISION: 'Returned for revision',
};

export const ACTIVITY_PROGRESS_STATE_LABELS: Record<ActivityProgressState, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  NEEDS_GRADING: 'Needs grading',
  RETURNED: 'Returned',
  GRADED: 'Graded',
  PASSED: 'Passed',
  FAILED: 'Failed',
  COMPLETED: 'Completed',
};

export const ACTIVITY_PROGRESS_STATE_CLASSES: Record<ActivityProgressState, string> = {
  NOT_STARTED: 'border-border bg-muted text-muted-foreground',
  IN_PROGRESS: 'border-primary/20 bg-primary/10 text-primary',
  SUBMITTED: 'border-warning/20 bg-warning/10 text-warning',
  NEEDS_GRADING: 'border-warning/20 bg-warning/10 text-warning',
  RETURNED: 'border-destructive/20 bg-destructive/10 text-destructive',
  GRADED: 'border-success/20 bg-success/10 text-success',
  PASSED: 'border-success/20 bg-success/10 text-success',
  FAILED: 'border-destructive/20 bg-destructive/10 text-destructive',
  COMPLETED: 'border-success/20 bg-success/10 text-success',
};

export function canTransitionSubmission(from: SubmissionStatus, to: SubmissionStatus): boolean {
  return SUBMISSION_ALLOWED_TRANSITIONS[from].includes(to);
}

export function getReleaseState(status: SubmissionStatus): ReleaseState {
  if (status === 'GRADED') return 'AWAITING_RELEASE';
  if (status === 'PUBLISHED') return 'VISIBLE';
  if (status === 'RETURNED') return 'RETURNED_FOR_REVISION';
  return 'HIDDEN';
}

export function isPublishedToStudent(status: SubmissionStatus): boolean {
  const releaseState = getReleaseState(status);
  return releaseState === 'VISIBLE' || releaseState === 'RETURNED_FOR_REVISION';
}

export function needsTeacherAction(status: SubmissionStatus): boolean {
  return status === 'PENDING';
}

export function canTeacherEditGrade(status: SubmissionStatus): boolean {
  return status === 'PENDING' || status === 'GRADED' || status === 'RETURNED';
}

export function canSelectForBatchGrading(status: SubmissionStatus): boolean {
  return canTeacherEditGrade(status);
}

export function canPublishGrade(status: SubmissionStatus): boolean {
  return status === 'GRADED';
}

export function canReturnSubmission(status: SubmissionStatus): boolean {
  return status === 'PENDING' || status === 'GRADED' || status === 'PUBLISHED';
}

export function isActivityProgressComplete(state: ActivityProgressState): boolean {
  return state === 'PASSED' || state === 'COMPLETED';
}

export function isActivityProgressOverdue(cell: ActivityProgressCell, now = Date.now()): boolean {
  if (!cell.due_at || isActivityProgressComplete(cell.state)) return false;
  return new Date(cell.due_at).getTime() < now;
}

export function activityProgressNeedsTeacherAction(cell: ActivityProgressCell): boolean {
  return cell.teacher_action_required && Boolean(cell.latest_submission_uuid);
}
