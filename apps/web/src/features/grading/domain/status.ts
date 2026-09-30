import type { ActivityProgressCell, ActivityProgressState, ReleaseState, SubmissionStatus } from './types'

export {
  SUBMISSION_ALLOWED_TRANSITIONS,
  SUBMISSION_STATUS_LABELS,
  canPublishGrade,
  canReturnSubmission,
  canSaveGradeDraft,
  canTeacherEditGrade,
  canTransitionSubmission,
  getSubmissionStatusLabel,
  isKnownSubmissionStatus,
  needsTeacherAction,
  type KnownSubmissionStatus,
} from '@/features/assessments/domain/submission-status'

export const RELEASE_STATE_LABELS: Record<string, string> = {
  HIDDEN: 'releaseStateHidden',
  AWAITING_RELEASE: 'releaseStateAwaitingRelease',
  VISIBLE: 'releaseStateVisible',
  RETURNED_FOR_REVISION: 'releaseStateReturned',
}

export function getReleaseState(status: SubmissionStatus | null | undefined): ReleaseState {
  if (status === 'GRADED') return 'AWAITING_RELEASE'
  if (status === 'PUBLISHED') return 'VISIBLE'
  if (status === 'RETURNED') return 'RETURNED_FOR_REVISION'
  return 'HIDDEN'
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

const ITEM_FEEDBACK_KEYS: Record<string, string> = {
  'no-answer': 'noAnswer',
  'no-correct-answer': 'noCorrectAnswer',
  correct: 'correct',
  incorrect: 'incorrect',
  'partially-correct-no-credit': 'partiallyCorrectNoCredit',
  'partially-correct': 'partiallyCorrect',
  'pairs-matched': 'pairsMatched',
  'tests-passed': 'testsPassed',
}

/**
 * The auto-grader's verdict on an item, localized from `feedback_code` +
 * `feedback_params` (`Features.Grading.itemFeedback.*`); an unknown code
 * falls back to the English `feedback`. Teacher prose has no code and
 * passes through as-is. Requires a translator scoped to 'Features.Grading'.
 */
export function localizeItemFeedback(
  item: { feedback?: string | null | undefined; feedback_code?: string | null | undefined; feedback_params?: unknown },
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const key = item.feedback_code ? ITEM_FEEDBACK_KEYS[item.feedback_code] : undefined
  if (!key) return item.feedback ?? ''
  const params = item.feedback_params && typeof item.feedback_params === 'object' ? item.feedback_params : {}
  return t(`itemFeedback.${key}`, params as Record<string, string | number>)
}
