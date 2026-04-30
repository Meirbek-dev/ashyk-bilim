/**
 * Surface-specific view models for the three product surfaces.
 *
 * Every assessment kind maps its data into one of these before passing it
 * to a surface shell. The shell renders chrome (topbar, breadcrumbs, save
 * state, lifecycle controls); the kind contributes a content panel.
 */

import type { AssessmentLifecycle } from './lifecycle';
import type { SubmissionStatus } from './submission-status';
import type { ReleaseState } from './release';
import type { NormalizedScore } from './score';
import type { PolicyView } from './policy';

/** The three product surfaces every assessment kind must support. */
export type AssessmentSurface = 'STUDIO' | 'REVIEW' | 'ATTEMPT';

/** Assessment kind identifiers — mirrors ActivityType from the backend. */
export type AssessmentKind = 'TYPE_ASSIGNMENT' | 'TYPE_EXAM' | 'TYPE_CODE_CHALLENGE' | 'TYPE_QUIZ';

// ── Studio surface ─────────────────────────────────────────────────────────────

/**
 * View model for the Author (Studio) surface.
 * Consumed by the shared StudioShell; the kind provides the content panel.
 */
export interface StudioViewModel {
  surface: 'STUDIO';
  kind: AssessmentKind;
  activityUuid: string;
  title: string;
  lifecycle: AssessmentLifecycle;
  isEditable: boolean;
  canPublish: boolean;
  canSchedule: boolean;
  canArchive: boolean;
  scheduledAt: string | null;
  policy: PolicyView;
  validationIssues: ValidationIssue[];
}

// ── Review surface ─────────────────────────────────────────────────────────────

/**
 * View model for the teacher-facing Submission Review surface.
 * Thin wrapper used by the review queue; full submission detail comes from
 * the Submission object itself.
 */
export interface ReviewQueueItemViewModel {
  surface: 'REVIEW';
  kind: AssessmentKind;
  submissionUuid: string;
  studentDisplayName: string;
  status: SubmissionStatus;
  releaseState: ReleaseState;
  score: NormalizedScore;
  isLate: boolean;
  submittedAt: string | null;
  needsTeacherAction: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canReturn: boolean;
}

// ── Attempt surface ────────────────────────────────────────────────────────────

/**
 * View model for the Student Attempt surface.
 * Shared by all kinds; the kind provides the task/question content.
 */
export interface AttemptViewModel {
  surface: 'ATTEMPT';
  kind: AssessmentKind;
  activityUuid: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  submissionStatus: SubmissionStatus | null;
  releaseState: ReleaseState;
  score: NormalizedScore;
  policy: PolicyView;
  /** Student may edit answers. */
  canEdit: boolean;
  /** Student may save a draft. */
  canSaveDraft: boolean;
  /** Student may submit (or re-submit). */
  canSubmit: boolean;
  /** Student has been returned feedback and should revise. */
  isReturnedForRevision: boolean;
  /** Score and feedback are visible to the student. */
  isResultVisible: boolean;
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

export interface ValidationIssue {
  code: string;
  message: string;
  /** UUID of the task/question that has the issue, if applicable. */
  itemUuid?: string;
}

/**
 * Maps the API-level AssessmentType (from SubmissionRead.assessment_type) to the
 * domain AssessmentKind. The API uses bare names (ASSIGNMENT, EXAM) while the domain
 * uses activity-type-prefixed names (TYPE_ASSIGNMENT, TYPE_EXAM).
 */
export function assessmentTypeToKind(assessmentType: string): AssessmentKind | null {
  switch (assessmentType) {
    case 'ASSIGNMENT': {
      return 'TYPE_ASSIGNMENT';
    }
    case 'EXAM': {
      return 'TYPE_EXAM';
    }
    case 'CODE_CHALLENGE': {
      return 'TYPE_CODE_CHALLENGE';
    }
    case 'QUIZ': {
      return 'TYPE_QUIZ';
    }
    default: {
      return null;
    }
  }
}
