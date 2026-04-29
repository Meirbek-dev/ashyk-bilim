/**
 * Canonical submission-status for the unified grading workflow.
 *
 * Five states shared by ALL assessment types:
 *   DRAFT      — student is working, not yet submitted
 *   PENDING    — submitted, awaiting teacher or auto-grading
 *   GRADED     — score set, not yet visible to student
 *   PUBLISHED  — score visible to student
 *   RETURNED   — sent back for revision
 *
 * Supersedes:
 *   - SubmissionStatus in features/grading/domain (identical — this is the source)
 *   - ExamAttempt.status IN_PROGRESS/SUBMITTED/AUTO_SUBMITTED
 *       → IN_PROGRESS maps to DRAFT; SUBMITTED/AUTO_SUBMITTED map to PENDING
 *   - CodeSubmission.status PENDING/PROCESSING/COMPLETED/FAILED
 *       → these become internal Judge0 detail; outer Submission stays at PENDING/GRADED
 */

import type { components } from '@/lib/api/generated/schema';

export type SubmissionStatus =
  components['schemas']['src__db__grading__submissions__SubmissionStatus'];

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  DRAFT: 'Draft',
  PENDING: 'Pending',
  GRADED: 'Awaiting publication',
  PUBLISHED: 'Published',
  RETURNED: 'Returned',
};

export const SUBMISSION_ALLOWED_TRANSITIONS: Record<SubmissionStatus, SubmissionStatus[]> = {
  DRAFT: ['PENDING'],
  PENDING: ['GRADED', 'RETURNED'],
  GRADED: ['PUBLISHED', 'RETURNED'],
  PUBLISHED: ['GRADED', 'RETURNED'],
  RETURNED: ['PENDING'],
};

export function canTransitionSubmission(from: SubmissionStatus, to: SubmissionStatus): boolean {
  return SUBMISSION_ALLOWED_TRANSITIONS[from].includes(to);
}

export function needsTeacherAction(status: SubmissionStatus): boolean {
  return status === 'PENDING';
}

export function canTeacherEditGrade(status: SubmissionStatus): boolean {
  return status === 'PENDING' || status === 'GRADED' || status === 'RETURNED';
}

export function canPublishGrade(status: SubmissionStatus): boolean {
  return status === 'GRADED';
}

export function canReturnSubmission(status: SubmissionStatus): boolean {
  return status === 'PENDING' || status === 'GRADED' || status === 'PUBLISHED';
}

/**
 * Maps legacy ExamAttempt status strings to unified SubmissionStatus.
 * Remove once the exam backend writes Submission rows directly.
 */
export function submissionStatusFromAttemptStatus(
  attemptStatus: 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED',
): SubmissionStatus {
  if (attemptStatus === 'IN_PROGRESS') return 'DRAFT';
  return 'PENDING';
}
