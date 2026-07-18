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

import type { components } from '@/lib/api/generated'

export type SubmissionStatus = components['schemas']['SubmissionStatus']
export type KnownSubmissionStatus = 'DRAFT' | 'PENDING' | 'GRADED' | 'PUBLISHED' | 'RETURNED'

export const SUBMISSION_STATUS_LABELS: Record<KnownSubmissionStatus, string> = {
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
const UNKNOWN_SUBMISSION_STATUS_LABEL = 'statusUnknown'
const KNOWN_SUBMISSION_STATUSES = new Set<KnownSubmissionStatus>([
  'DRAFT',
  'PENDING',
  'GRADED',
  'PUBLISHED',
  'RETURNED',
])

export function isKnownSubmissionStatus(
  status: SubmissionStatus | string | null | undefined,
): status is KnownSubmissionStatus {
  return typeof status === 'string' && KNOWN_SUBMISSION_STATUSES.has(status as KnownSubmissionStatus)
}

export function getSubmissionStatusLabel(
  status: SubmissionStatus | null | undefined,
  t: (key: string) => string,
): string {
  if (!isKnownSubmissionStatus(status)) {
    return t(UNKNOWN_SUBMISSION_STATUS_LABEL)
  }

  return t(SUBMISSION_STATUS_LABELS[status])
}

export const SUBMISSION_ALLOWED_TRANSITIONS: Record<string, SubmissionStatus[]> = {
  DRAFT: ['PENDING'],
  PENDING: ['GRADED', 'RETURNED'],
  GRADED: ['PUBLISHED', 'RETURNED'],
  PUBLISHED: ['GRADED', 'RETURNED'],
  RETURNED: ['PENDING'],
}

export function canTransitionSubmission(
  from: SubmissionStatus | null | undefined,
  to: SubmissionStatus | null | undefined,
): boolean {
  if (!isKnownSubmissionStatus(from) || !isKnownSubmissionStatus(to)) {
    return false
  }

  const allowedTransitions = SUBMISSION_ALLOWED_TRANSITIONS[from]
  return allowedTransitions?.includes(to) ?? false
}

export function needsTeacherAction(status: SubmissionStatus | null | undefined): boolean {
  return status === 'PENDING'
}

export function canTeacherEditGrade(status: SubmissionStatus | null | undefined): boolean {
  return status === 'PENDING' || status === 'GRADED' || status === 'RETURNED'
}

export function canPublishGrade(status: SubmissionStatus | null | undefined): boolean {
  return status === 'GRADED'
}

export function canReturnSubmission(status: SubmissionStatus | null | undefined): boolean {
  return status === 'PENDING' || status === 'GRADED' || status === 'PUBLISHED'
}
