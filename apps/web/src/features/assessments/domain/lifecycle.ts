/**
 * AssessmentLifecycle — unified authoring lifecycle that applies to every
 * assessable activity type (assignments, exams, code challenges, quizzes).
 *
 * Supersedes:
 *   - AssignmentStatus (DRAFT/SCHEDULED/PUBLISHED/ARCHIVED) — already this shape
 *   - Exam.published: boolean — must migrate to this enum
 *   - Code-challenge (no lifecycle today) — starts at DRAFT
 */
export type AssessmentLifecycle = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';

export const LIFECYCLE_LABELS: Record<AssessmentLifecycle, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
};

export const LIFECYCLE_DESCRIPTIONS: Record<AssessmentLifecycle, string> = {
  DRAFT: 'Editable. Hidden from students.',
  SCHEDULED: 'Publication is scheduled for a future time.',
  PUBLISHED: 'Visible to students.',
  ARCHIVED: 'Read-only. No new submissions.',
};

export const LIFECYCLE_ALLOWED_TRANSITIONS: Record<AssessmentLifecycle, AssessmentLifecycle[]> = {
  DRAFT: ['SCHEDULED', 'PUBLISHED', 'ARCHIVED'],
  SCHEDULED: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function isAssessmentEditable(lifecycle: AssessmentLifecycle): boolean {
  return lifecycle === 'DRAFT' || lifecycle === 'SCHEDULED';
}

export function canPublish(lifecycle: AssessmentLifecycle): boolean {
  return lifecycle === 'DRAFT' || lifecycle === 'SCHEDULED';
}

export function canSchedule(lifecycle: AssessmentLifecycle): boolean {
  return lifecycle === 'DRAFT';
}

export function canArchive(lifecycle: AssessmentLifecycle): boolean {
  return lifecycle !== 'ARCHIVED';
}

export function canTransitionLifecycle(from: AssessmentLifecycle, to: AssessmentLifecycle): boolean {
  return (LIFECYCLE_ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}
