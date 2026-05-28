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

import type { components } from '@/lib/api/generated/schema'

// ── Re-exported generated types ───────────────────────────────────────────────

export type SubmissionStatus = components['schemas']['SubmissionStatus']
export type AssessmentType = components['schemas']['AssessmentType']

export type GradedItem = components['schemas']['GradedItem']
export type GradingBreakdown = components['schemas']['GradingBreakdown']
export type Submission =
  | components['schemas']['SubmissionRead']
  | components['schemas']['TeacherSubmissionRead']
export type SubmissionUser = components['schemas']['SubmissionUser']

/** Typed paginated response for the teacher submissions list. */
export type SubmissionsPage = components['schemas']['SubmissionListResponse']
export type SubmissionStats = components['schemas']['SubmissionStats']

export type ItemFeedback = components['schemas']['ItemFeedback']
export type TeacherGradeInput = components['schemas']['TeacherGradeInput']
export type BatchGradeItem = components['schemas']['BatchGradeItem']
export type BatchGradeRequest = components['schemas']['BatchGradeRequest']
export type BatchGradeResultItem = components['schemas']['BatchGradeResultItem']
export type BatchGradeResponse = components['schemas']['BatchGradeResponse']

export type ActivityProgressState = components['schemas']['ActivityProgressState']
export type ActivityProgressCell = components['schemas']['ActivityProgressCell']
export type CourseGradebookResponse = components['schemas']['CourseGradebookResponse']
export type GradebookActivity = components['schemas']['GradebookActivity']
export type GradebookStudent = components['schemas']['GradebookStudent']
export type GradebookSummary = components['schemas']['GradebookSummary']
export type TeacherAction = components['schemas']['TeacherAction']

export interface InlineItemFeedback {
  id: number
  grading_entry_id: number
  submission_id: number
  task_id?: number | null
  item_ref: string
  comment: string
  score?: number | null
  max_score?: number | null
  annotation_type: 'TEXT' | 'HIGHLIGHT' | 'AUDIO'
  annotation_data_key?: string | null
  graded_by?: number | null
  created_at: string
  updated_at: string
}

export interface InlineItemFeedbackInput {
  grading_entry_id?: number | null
  task_id?: number | null
  item_ref: string
  comment?: string
  score?: number | null
  max_score?: number | null
  annotation_type?: 'TEXT' | 'HIGHLIGHT' | 'AUDIO'
  annotation_data_key?: string | null
}

export interface BulkAction {
  id: number
  action_uuid: string
  performed_by: number
  action_type:
    | 'EXTEND_DEADLINE'
    | 'RELEASE_GRADES'
    | 'RETURN_ALL'
    | 'OVERRIDE_SCORE'
    | 'BATCH_GRADE'
  params: Record<string, unknown>
  target_user_ids: number[]
  activity_id: number
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  affected_count: number
  error_log: string
  created_at: string
  completed_at?: string | null
}

export interface BulkPublishGradesResponse {
  activity_id: number
  published_count: number
  already_published_count: number
}
