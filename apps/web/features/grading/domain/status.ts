import type { ActivityProgressCell, ActivityProgressState, ReleaseState, SubmissionStatus } from './types';

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  DRAFT: 'Draft',
  PENDING: 'Pending',
  GRADED: 'Awaiting publication',
  PUBLISHED: 'Published',
  RETURNED: 'Returned',
};

export const SUBMISSION_STATUS_COLORS: Record<SubmissionStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PENDING: 'bg-amber-100 text-amber-800',
  GRADED: 'bg-emerald-100 text-emerald-800',
  PUBLISHED: 'bg-teal-100 text-teal-800',
  RETURNED: 'bg-violet-100 text-violet-800',
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
  NOT_STARTED: 'border-slate-200 bg-slate-50 text-slate-700',
  IN_PROGRESS: 'border-blue-200 bg-blue-50 text-blue-700',
  SUBMITTED: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  NEEDS_GRADING: 'border-amber-200 bg-amber-50 text-amber-800',
  RETURNED: 'border-violet-200 bg-violet-50 text-violet-800',
  GRADED: 'border-teal-200 bg-teal-50 text-teal-800',
  PASSED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  FAILED: 'border-rose-200 bg-rose-50 text-rose-800',
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
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
