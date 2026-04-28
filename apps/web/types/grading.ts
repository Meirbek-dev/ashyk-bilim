/**
 * Grading system type definitions — v4.
 *
 * Interface definitions are re-exported from the auto-generated OpenAPI schema
 * (`lib/api/generated/schema.ts`). Only utility constants and helpers live here.
 *
 * Status model (5 states):
 *   DRAFT      — student is working, not yet submitted
 *   PENDING    — submitted, awaiting teacher grading
 *   GRADED     — teacher has set a final score (not yet visible to student)
 *   PUBLISHED  — grade is visible to the student
 *   RETURNED   — teacher sent it back for revision
 *
 * Late submissions use is_late: boolean on the Submission object itself.
 */

import type { components } from '@/lib/api/generated/schema';

// ── Re-exported generated types ───────────────────────────────────────────────

export type SubmissionStatus = components['schemas']['src__db__grading__submissions__SubmissionStatus'];
export type AssessmentType = components['schemas']['AssessmentType'];

export type GradedItem = components['schemas']['GradedItem'];
export type GradingBreakdown = components['schemas']['GradingBreakdown'];
export type Submission = components['schemas']['SubmissionRead'];
export type SubmissionUser = components['schemas']['SubmissionUser'];

/** Typed paginated response for the teacher submissions list. */
export type SubmissionsPage = components['schemas']['SubmissionListResponse'];
export type SubmissionStats = components['schemas']['SubmissionStats'];

export type ItemFeedback = components['schemas']['ItemFeedback'];
export type TeacherGradeInput = components['schemas']['TeacherGradeInput'];
export type BatchGradeItem = components['schemas']['BatchGradeItem'];
export type BatchGradeRequest = components['schemas']['BatchGradeRequest'];
export type BatchGradeResultItem = components['schemas']['BatchGradeResultItem'];
export type BatchGradeResponse = components['schemas']['BatchGradeResponse'];

export type ActivityProgressState = components['schemas']['ActivityProgressState'];
export type ActivityProgressCell = components['schemas']['ActivityProgressCell'];
export type CourseGradebookResponse = components['schemas']['CourseGradebookResponse'];
export type GradebookActivity = components['schemas']['GradebookActivity'];
export type GradebookStudent = components['schemas']['GradebookStudent'];
export type GradebookSummary = components['schemas']['GradebookSummary'];
export type TeacherAction = components['schemas']['TeacherAction'];

export interface InlineItemFeedback {
  id: number;
  grading_entry_id: number;
  submission_id: number;
  task_id?: number | null;
  item_ref: string;
  comment: string;
  score?: number | null;
  max_score?: number | null;
  annotation_type: 'TEXT' | 'HIGHLIGHT' | 'AUDIO';
  annotation_data_key?: string | null;
  graded_by?: number | null;
  created_at: string;
  updated_at: string;
}

export interface InlineItemFeedbackInput {
  grading_entry_id?: number | null;
  task_id?: number | null;
  item_ref: string;
  comment?: string;
  score?: number | null;
  max_score?: number | null;
  annotation_type?: 'TEXT' | 'HIGHLIGHT' | 'AUDIO';
  annotation_data_key?: string | null;
}

/** Backward-compatible aliases for older imports while callers migrate. */
export type GradebookCell = ActivityProgressCell;
export type GradebookResponse = CourseGradebookResponse;

// ── Answer payload shapes (frontend-only, not in OpenAPI schema) ──────────────

export interface QuizAnswer {
  question_id: string;
  selected_option_ids: string[];
  text_answer?: string | null;
}

export interface QuizAnswers {
  answers: QuizAnswer[];
  started_at: string;
  submitted_at: string;
}

export interface AssignmentTaskAnswer {
  task_uuid: string;
  content_type: 'file' | 'text' | 'form' | 'quiz' | 'other';
  file_key?: string | null;
  text_content?: string | null;
  form_data?: Record<string, unknown> | null;
  quiz_answers?: Record<string, unknown> | null;
  answer_metadata?: Record<string, unknown>;
}

export interface AssignmentAnswers {
  tasks: AssignmentTaskAnswer[];
}

export interface ExamQuestionAnswer {
  question_id: number;
  selected_option_ids: string[];
  text_answer?: string | null;
}

export interface ExamAnswers {
  submitted_answers: Record<number, ExamQuestionAnswer>;
  started_at: string;
  submitted_at: string;
}

export interface TestCaseResult {
  test_id: string;
  passed: boolean;
  weight?: number;
  description?: string;
  message?: string;
}

export interface CodeChallengeAnswers {
  test_results: TestCaseResult[];
  code_strategy?: string;
  source_code?: string;
}

// ── Status display helpers ────────────────────────────────────────────────────

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  DRAFT: 'Draft',
  PENDING: 'Pending',
  GRADED: 'Awaiting publication',
  PUBLISHED: 'Published',
  RETURNED: 'Returned',
};

export const STATUS_COLORS: Record<SubmissionStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PENDING: 'bg-amber-100 text-amber-800',
  GRADED: 'bg-emerald-100 text-emerald-800',
  PUBLISHED: 'bg-teal-100 text-teal-800',
  RETURNED: 'bg-violet-100 text-violet-800',
};

export const ACTIVITY_PROGRESS_STATE_LABELS: Record<ActivityProgressState, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  NEEDS_GRADING: 'Needs grading',
  RETURNED: 'Returned',
  GRADED: 'Graded',
  PASSED: 'Passed',
  FAILED: 'Failed',
  COMPLETED: 'Completed',
};

export const ACTIVITY_PROGRESS_STATE_CLASSES: Record<ActivityProgressState, string> = {
  NOT_STARTED: 'border-slate-200 bg-slate-50 text-slate-700',
  IN_PROGRESS: 'border-blue-200 bg-blue-50 text-blue-700',
  SUBMITTED: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  NEEDS_GRADING: 'border-amber-200 bg-amber-50 text-amber-800',
  RETURNED: 'border-violet-200 bg-violet-50 text-violet-800',
  GRADED: 'border-teal-200 bg-teal-50 text-teal-800',
  PASSED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  FAILED: 'border-rose-200 bg-rose-50 text-rose-800',
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

export function isActivityProgressComplete(state: ActivityProgressState): boolean {
  return state === 'PASSED' || state === 'COMPLETED';
}

export function isActivityProgressOverdue(cell: ActivityProgressCell, now = Date.now()): boolean {
  if (!cell.due_at || isActivityProgressComplete(cell.state)) return false;
  return new Date(cell.due_at).getTime() < now;
}

export function activityProgressNeedsTeacherAction(cell: ActivityProgressCell): boolean {
  return cell.teacher_action_required && Boolean(cell.latest_submission_uuid);
}

/** True when the submission needs teacher action */
export function needsTeacherAction(status: SubmissionStatus): boolean {
  return status === 'PENDING';
}

/** True when a teacher can still edit and resubmit a grade. */
export function canTeacherEditGrade(status: SubmissionStatus): boolean {
  return status === 'PENDING' || status === 'GRADED' || status === 'RETURNED';
}

/** True when the submission can be selected for batch grading. */
export function canSelectForBatchGrading(status: SubmissionStatus): boolean {
  return canTeacherEditGrade(status);
}

/** True when the grade is visible to the student */
export function isPublishedToStudent(status: SubmissionStatus): boolean {
  return status === 'PUBLISHED' || status === 'RETURNED';
}
