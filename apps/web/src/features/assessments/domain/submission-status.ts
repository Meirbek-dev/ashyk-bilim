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

import type { components } from '@/lib/api/generated/schema'

export type SubmissionStatus = components['schemas']['SubmissionStatus']

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  DRAFT: 'statusDraft',
  PENDING: 'statusPending',
  GRADED: 'statusGraded',
  PUBLISHED: 'statusPublished',
  RETURNED: 'statusReturned',
}

/**
 * Get localized label for a submission status.
 * Requires a translator function scoped to 'Grading.Table' namespace.
 */
export function getSubmissionStatusLabel(status: SubmissionStatus, t: (key: string) => string): string {
  return t(SUBMISSION_STATUS_LABELS[status])
}

export const SUBMISSION_ALLOWED_TRANSITIONS: Record<SubmissionStatus, SubmissionStatus[]> = {
  DRAFT: ['PENDING'],
  PENDING: ['GRADED', 'RETURNED'],
  GRADED: ['PUBLISHED', 'RETURNED'],
  PUBLISHED: ['GRADED', 'RETURNED'],
  RETURNED: ['PENDING'],
}

export function canTransitionSubmission(from: SubmissionStatus, to: SubmissionStatus): boolean {
  return SUBMISSION_ALLOWED_TRANSITIONS[from].includes(to)
}

export function needsTeacherAction(status: SubmissionStatus): boolean {
  return status === 'PENDING'
}

export function canTeacherEditGrade(status: SubmissionStatus): boolean {
  return status === 'PENDING' || status === 'GRADED' || status === 'RETURNED'
}

export function canPublishGrade(status: SubmissionStatus): boolean {
  return status === 'GRADED'
}

export function canReturnSubmission(status: SubmissionStatus): boolean {
  return status === 'PENDING' || status === 'GRADED' || status === 'PUBLISHED'
}
