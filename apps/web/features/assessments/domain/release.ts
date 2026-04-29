/**
 * ReleaseState — answers "what can the student currently see?"
 *
 * Derived from SubmissionStatus. Applies to all assessment types.
 *
 * HIDDEN              — no score or feedback is visible (DRAFT / PENDING)
 * AWAITING_RELEASE    — teacher graded, grade not yet released (GRADED)
 * VISIBLE             — grade and feedback visible to student (PUBLISHED)
 * RETURNED_FOR_REVISION — feedback visible, student may re-submit (RETURNED)
 */

import type { SubmissionStatus } from './submission-status';

export type ReleaseState =
  | 'HIDDEN'
  | 'AWAITING_RELEASE'
  | 'VISIBLE'
  | 'RETURNED_FOR_REVISION';

export const RELEASE_STATE_LABELS: Record<ReleaseState, string> = {
  HIDDEN: 'Hidden from student',
  AWAITING_RELEASE: 'Awaiting release',
  VISIBLE: 'Visible to student',
  RETURNED_FOR_REVISION: 'Returned for revision',
};

export function getReleaseState(status: SubmissionStatus): ReleaseState {
  switch (status) {
    case 'GRADED': return 'AWAITING_RELEASE';
    case 'PUBLISHED': return 'VISIBLE';
    case 'RETURNED': return 'RETURNED_FOR_REVISION';
    default: return 'HIDDEN';
  }
}

export function isVisibleToStudent(status: SubmissionStatus): boolean {
  const state = getReleaseState(status);
  return state === 'VISIBLE' || state === 'RETURNED_FOR_REVISION';
}

export function hasStudentFeedback(status: SubmissionStatus): boolean {
  return isVisibleToStudent(status);
}
