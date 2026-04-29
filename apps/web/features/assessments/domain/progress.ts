/**
 * ActivityProgress — teacher-facing learner/activity projection.
 *
 * Derived from submission status + policy state (due date, passing score, etc.).
 * This is read-only for the teacher; it is never stored directly.
 *
 * Re-exports the generated type and provides display helpers.
 */

import type { components } from '@/lib/api/generated/schema';

export type ActivityProgressState = components['schemas']['ActivityProgressState'];
export type ActivityProgressCell = components['schemas']['ActivityProgressCell'];

export const PROGRESS_STATE_LABELS: Record<ActivityProgressState, string> = {
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

/** Tailwind classes for each state pill. */
export const PROGRESS_STATE_CLASSES: Record<ActivityProgressState, string> = {
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

export function isProgressComplete(state: ActivityProgressState): boolean {
  return state === 'PASSED' || state === 'COMPLETED';
}

export function isProgressOverdue(cell: ActivityProgressCell, now = Date.now()): boolean {
  if (!cell.due_at || isProgressComplete(cell.state)) return false;
  return new Date(cell.due_at).getTime() < now;
}

export function progressNeedsTeacherAction(cell: ActivityProgressCell): boolean {
  return cell.teacher_action_required && Boolean(cell.latest_submission_uuid);
}
