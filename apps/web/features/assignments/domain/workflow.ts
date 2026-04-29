import type { AssignmentStatus, AssignmentSurface } from './types';

export const ASSIGNMENT_SURFACES: Record<AssignmentSurface, { label: string; description: string }> = {
  ASSIGNMENT_STUDIO: {
    label: 'Assignment Studio',
    description: 'Teacher authoring, settings, preview, and publishing.',
  },
  SUBMISSION_REVIEW: {
    label: 'Submission Review',
    description: 'Teacher queue, grading, feedback, and release.',
  },
  STUDENT_ATTEMPT: {
    label: 'Student Attempt',
    description: 'Student work, draft saving, submission, and visible result.',
  },
};

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
};

export const ASSIGNMENT_STATUS_DESCRIPTIONS: Record<AssignmentStatus, string> = {
  DRAFT: 'Editable by teachers and hidden from students.',
  SCHEDULED: 'Publication is scheduled for a future time.',
  PUBLISHED: 'Visible to students.',
  ARCHIVED: 'Read-only historical assignment.',
};

export const ASSIGNMENT_ALLOWED_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  DRAFT: ['SCHEDULED', 'PUBLISHED', 'ARCHIVED'],
  SCHEDULED: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionAssignment(from: AssignmentStatus, to: AssignmentStatus): boolean {
  return ASSIGNMENT_ALLOWED_TRANSITIONS[from].includes(to);
}

export function isAssignmentEditable(status: AssignmentStatus): boolean {
  return status === 'DRAFT' || status === 'SCHEDULED';
}

export function canPublishAssignment(status: AssignmentStatus): boolean {
  return status === 'DRAFT' || status === 'SCHEDULED';
}

export function canScheduleAssignment(status: AssignmentStatus): boolean {
  return status === 'DRAFT';
}

export function canArchiveAssignment(status: AssignmentStatus): boolean {
  return status !== 'ARCHIVED';
}
