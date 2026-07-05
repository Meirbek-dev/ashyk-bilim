import {
  canPublishGrade,
  canReturnSubmission,
  canTeacherEditGrade,
  getReleaseState,
  needsTeacherAction,
} from './status'
import { formatScoreFraction } from './scoring'
import type { Submission, SubmissionReviewViewModel } from './types'

export function getSubmissionDisplayName(submission: Pick<Submission, 'user' | 'user_id'> | null | undefined): string {
  if (!submission?.user) return submission?.user_id ? `User #${submission.user_id}` : '--'
  return (
    [submission.user.first_name, submission.user.middle_name, submission.user.last_name].filter(Boolean).join(' ') ||
    `@${submission.user.username}`
  )
}

export function buildSubmissionReviewViewModel(submission: Submission): SubmissionReviewViewModel {
  const releaseStateValue =
    'release_state' in submission && typeof submission.release_state === 'string' ? submission.release_state : null
  const releaseState: SubmissionReviewViewModel['releaseState'] =
    releaseStateValue === 'HIDDEN' ||
    releaseStateValue === 'AWAITING_RELEASE' ||
    releaseStateValue === 'VISIBLE' ||
    releaseStateValue === 'RETURNED_FOR_REVISION'
      ? releaseStateValue
      : getReleaseState(submission.status)
  return {
    surface: 'SUBMISSION_REVIEW',
    submission,
    displayName: getSubmissionDisplayName(submission),
    releaseState,
    scoreLabel: formatScoreFraction(submission.final_score, 100),
    isLate: Boolean(submission.is_late),
    needsTeacherAction: needsTeacherAction(submission.status),
    canTeacherEdit: canTeacherEditGrade(submission.status),
    canPublish: canPublishGrade(submission.status),
    canReturn: canReturnSubmission(submission.status),
  }
}
