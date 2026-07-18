import type { ActivityProgressCell, ActivityProgressState, ReleaseState, SubmissionStatus } from './types'
import { canTeacherEditGrade } from '@/features/assessments/domain/submission-status'

export {
  SUBMISSION_ALLOWED_TRANSITIONS,
  SUBMISSION_STATUS_LABELS,
  canPublishGrade,
  canReturnSubmission,
  canTeacherEditGrade,
  canTransitionSubmission,
  getSubmissionStatusLabel,
  isKnownSubmissionStatus,
  needsTeacherAction,
  type KnownSubmissionStatus,
} from '@/features/assessments/domain/submission-status'

export const SUBMISSION_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  PENDING: 'bg-warning/10 text-warning',
  GRADED: 'bg-success/10 text-success',
  PUBLISHED: 'bg-primary/10 text-primary',
  RETURNED: 'bg-destructive/10 text-destructive',
}

export const RELEASE_STATE_LABELS: Record<string, string> = {
  HIDDEN: 'releaseStateHidden',
  AWAITING_RELEASE: 'releaseStateAwaitingRelease',
  VISIBLE: 'releaseStateVisible',
  RETURNED_FOR_REVISION: 'releaseStateReturned',
}

export const ACTIVITY_PROGRESS_STATE_LABELS: Record<string, string> = {
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
 * Get localized label for a release state.
 * Requires a translator function scoped to 'Features.Grading.Review' or 'Grading.Panel' namespace.
 */
export function getReleaseStateLabel(
  state: ReleaseState | string | null | undefined,
  t: (key: string) => string,
): string {
  const normalizedState = state ?? 'HIDDEN'
  const labelKey = (RELEASE_STATE_LABELS[normalizedState] ?? RELEASE_STATE_LABELS.HIDDEN)!
  return t(labelKey)
}

/**
 * Get localized label for an activity progress state.
 * Requires a translator function scoped to 'Grading.Gradebook.states' namespace.
 */
export function getActivityProgressStateLabel(
  state: ActivityProgressState | string | null | undefined,
  t: (key: string) => string,
): string {
  const normalizedState = state ?? 'NOT_STARTED'
  const labelKey = (ACTIVITY_PROGRESS_STATE_LABELS[normalizedState] ?? ACTIVITY_PROGRESS_STATE_LABELS.NOT_STARTED)!
  return t(labelKey)
}

export const ACTIVITY_PROGRESS_STATE_CLASSES: Record<string, string> = {
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

export function getReleaseState(status: SubmissionStatus | null | undefined): ReleaseState {
  if (status === 'GRADED') return 'AWAITING_RELEASE'
  if (status === 'PUBLISHED') return 'VISIBLE'
  if (status === 'RETURNED') return 'RETURNED_FOR_REVISION'
  return 'HIDDEN'
}

export function isPublishedToStudent(status: SubmissionStatus | null | undefined): boolean {
  const releaseState = getReleaseState(status)
  return releaseState === 'VISIBLE' || releaseState === 'RETURNED_FOR_REVISION'
}

export function canSelectForBatchGrading(status: SubmissionStatus | null | undefined): boolean {
  return canTeacherEditGrade(status)
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
