import type { ActivityProgressCell, ActivityProgressState, ReleaseState, SubmissionStatus } from './types'

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  DRAFT: 'statusDraft',
  PENDING: 'statusPending',
  GRADED: 'statusGraded',
  PUBLISHED: 'statusPublished',
  RETURNED: 'statusReturned',
}

export const SUBMISSION_STATUS_COLORS: Record<SubmissionStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  PENDING: 'bg-warning/10 text-warning',
  GRADED: 'bg-success/10 text-success',
  PUBLISHED: 'bg-primary/10 text-primary',
  RETURNED: 'bg-destructive/10 text-destructive',
}

export const SUBMISSION_ALLOWED_TRANSITIONS: Record<SubmissionStatus, SubmissionStatus[]> = {
  DRAFT: ['PENDING'],
  PENDING: ['GRADED', 'RETURNED'],
  GRADED: ['PUBLISHED', 'RETURNED'],
  PUBLISHED: ['GRADED', 'RETURNED'],
  RETURNED: ['PENDING'],
}

export const RELEASE_STATE_LABELS: Record<ReleaseState, string> = {
  HIDDEN: 'releaseStateHidden',
  AWAITING_RELEASE: 'releaseStateAwaitingRelease',
  VISIBLE: 'releaseStateVisible',
  RETURNED_FOR_REVISION: 'releaseStateReturned',
}

export const ACTIVITY_PROGRESS_STATE_LABELS: Record<ActivityProgressState, string> = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
  NEEDS_GRADING: 'needs_grading',
  RETURNED: 'returned',
  GRADED: 'graded',
  PASSED: 'passed',
  FAILED: 'failed',
  COMPLETED: 'completed',
}

/**
 * Get localized label for a submission status.
 * Requires a translator function scoped to 'Grading.Table' namespace.
 */
export function getSubmissionStatusLabel(status: SubmissionStatus, t: (key: string) => string): string {
  return t(SUBMISSION_STATUS_LABELS[status])
}

/**
 * Get localized label for a release state.
 * Requires a translator function scoped to 'Features.Grading.Review' or 'Grading.Panel' namespace.
 */
export function getReleaseStateLabel(state: ReleaseState, t: (key: string) => string): string {
  return t(RELEASE_STATE_LABELS[state])
}

/**
 * Get localized label for an activity progress state.
 * Requires a translator function scoped to 'Grading.Gradebook.states' namespace.
 */
export function getActivityProgressStateLabel(state: ActivityProgressState, t: (key: string) => string): string {
  return t(ACTIVITY_PROGRESS_STATE_LABELS[state])
}

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
}

export function canTransitionSubmission(from: SubmissionStatus, to: SubmissionStatus): boolean {
  return SUBMISSION_ALLOWED_TRANSITIONS[from].includes(to)
}

export function getReleaseState(status: SubmissionStatus): ReleaseState {
  if (status === 'GRADED') return 'AWAITING_RELEASE'
  if (status === 'PUBLISHED') return 'VISIBLE'
  if (status === 'RETURNED') return 'RETURNED_FOR_REVISION'
  return 'HIDDEN'
}

export function isPublishedToStudent(status: SubmissionStatus): boolean {
  const releaseState = getReleaseState(status)
  return releaseState === 'VISIBLE' || releaseState === 'RETURNED_FOR_REVISION'
}

export function needsTeacherAction(status: SubmissionStatus): boolean {
  return status === 'PENDING'
}

export function canTeacherEditGrade(status: SubmissionStatus): boolean {
  return status === 'PENDING' || status === 'GRADED' || status === 'RETURNED'
}

export function canSelectForBatchGrading(status: SubmissionStatus): boolean {
  return canTeacherEditGrade(status)
}

export function canPublishGrade(status: SubmissionStatus): boolean {
  return status === 'GRADED'
}

export function canReturnSubmission(status: SubmissionStatus): boolean {
  return status === 'PENDING' || status === 'GRADED' || status === 'PUBLISHED'
}

export function isActivityProgressComplete(state: ActivityProgressState): boolean {
  return state === 'PASSED' || state === 'COMPLETED'
}

export function isActivityProgressOverdue(cell: ActivityProgressCell, now = Date.now()): boolean {
  if (!cell.due_at || isActivityProgressComplete(cell.state)) return false
  return new Date(cell.due_at).getTime() < now
}

export function activityProgressNeedsTeacherAction(cell: ActivityProgressCell): boolean {
  return cell.teacher_action_required && Boolean(cell.latest_submission_uuid)
}
