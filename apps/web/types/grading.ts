/**
 * Grading system type definitions — v3.
 *
 * Status model (simplified from 7 → 5 states):
 *   DRAFT      — student is working, not yet submitted
 *   PENDING    — submitted, awaiting teacher grading (replaces SUBMITTED / LATE / UNDER_REVIEW)
 *   GRADED     — teacher has set a final score (not yet visible to student)
 *   PUBLISHED  — grade is visible to the student
 *   RETURNED   — teacher sent it back for revision
 *
 * Late submissions use is_late: boolean on the Submission object itself.
 */

// ── Enums ────────────────────────────────────────────────────────────────────

export type SubmissionStatus = 'DRAFT' | 'PENDING' | 'GRADED' | 'PUBLISHED' | 'RETURNED';

export type AssessmentType = 'QUIZ' | 'ASSIGNMENT' | 'EXAM' | 'CODE_CHALLENGE';

// ── Grading breakdown ────────────────────────────────────────────────────────

export interface GradedItem {
  item_id: string;
  item_text: string;
  score: number;
  max_score: number;
  correct: boolean | null; // null for non-auto-gradeable items
  feedback: string;
  needs_manual_review: boolean;
  user_answer: unknown;
  correct_answer: unknown;
}

export interface GradingBreakdown {
  items: GradedItem[];
  needs_manual_review: boolean;
  auto_graded: boolean;
  feedback?: string;
}

// ── Submission ───────────────────────────────────────────────────────────────

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
  content_type: 'file' | 'text' | 'form';
  file_key?: string | null;
  text_content?: string | null;
  form_data?: Record<string, unknown> | null;
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

export interface Submission {
  id: number;
  submission_uuid: string;
  assessment_type: AssessmentType;
  activity_id: number;
  user_id: number;

  auto_score: number | null;
  final_score: number | null;

  status: SubmissionStatus;
  attempt_number: number;
  is_late: boolean;

  answers_json: QuizAnswers | AssignmentAnswers | ExamAnswers | CodeChallengeAnswers | Record<string, unknown>;
  grading_json: GradingBreakdown;

  started_at: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  created_at: string;
  updated_at: string;
  grading_version: number;

  // Enriched by teacher endpoint
  user?: SubmissionUser;
}

export interface SubmissionUser {
  id: number;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  middle_name?: string | null;
  email: string;
  avatar_image?: string | null;
  user_uuid?: string | null;
}

// ── Paginated response ────────────────────────────────────────────────────────

export interface SubmissionsPage {
  items: Submission[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

// ── Aggregate stats ───────────────────────────────────────────────────────────

export interface SubmissionStats {
  total: number;
  graded_count: number;
  needs_grading_count: number; // count of PENDING submissions
  late_count: number; // count of PENDING submissions where is_late=true
  avg_score: number | null;
  pass_rate: number | null;
}

// ── Teacher grade input ───────────────────────────────────────────────────────

export interface ItemFeedback {
  item_id: string;
  score?: number | null;
  feedback: string;
}

export interface TeacherGradeInput {
  final_score: number;
  item_feedback?: ItemFeedback[];
  /** GRADED = save (teacher-visible only), PUBLISHED = publish to student, RETURNED = request revision */
  status: 'GRADED' | 'PUBLISHED' | 'RETURNED';
  feedback?: string;
}

export interface BatchGradeItem {
  submission_uuid: string;
  final_score: number;
  status: 'GRADED' | 'PUBLISHED' | 'RETURNED';
  feedback?: string | null;
  item_feedback?: ItemFeedback[] | null;
}

export interface BatchGradeRequest {
  grades: BatchGradeItem[];
}

export interface BatchGradeResultItem {
  submission_uuid: string;
  success: boolean;
  error?: string | null;
}

export interface BatchGradeResponse {
  results: BatchGradeResultItem[];
  succeeded: number;
  failed: number;
}

// ── Status display helpers ────────────────────────────────────────────────────

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  DRAFT: 'Draft',
  PENDING: 'Pending',
  GRADED: 'Graded',
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
