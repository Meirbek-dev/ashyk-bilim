/**
 * AssessmentLifecycle — unified authoring lifecycle that applies to every
 * assessable activity type (exams, code challenges, quizzes).
 *
 * Supersedes:
 *   - Assessment lifecycle state (DRAFT/SCHEDULED/PUBLISHED/ARCHIVED)
 *   - Exam.published: boolean — must migrate to this enum
 *   - Code-challenge (no lifecycle today) — starts at DRAFT
 */
export type AssessmentLifecycle = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED'

/** BUG-171: the server keeps a scheduled assessment read-only (BUG-162) — unschedule to edit. */
export function isAssessmentEditable(lifecycle: AssessmentLifecycle): boolean {
  return lifecycle === 'DRAFT'
}

export function canPublish(lifecycle: AssessmentLifecycle): boolean {
  return lifecycle === 'DRAFT' || lifecycle === 'SCHEDULED'
}

export function canSchedule(lifecycle: AssessmentLifecycle): boolean {
  return lifecycle === 'DRAFT'
}

export function canArchive(lifecycle: AssessmentLifecycle): boolean {
  return lifecycle !== 'ARCHIVED'
}
