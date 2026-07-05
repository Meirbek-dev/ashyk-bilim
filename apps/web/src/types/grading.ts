/**
 * Grading system type definitions — v4.
 *
 * Interface definitions are re-exported from the normalized grading domain.
 * Only utility constants and helpers live here.
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

import type {
  ActivityProgressCell,
  ActivityProgressState,
  AssessmentType,
  BatchGradeItem,
  BatchGradeRequest,
  BatchGradeResponse,
  CourseGradebookResponse,
  GradebookActivity,
  GradebookStudent,
  GradebookSummary,
  GradedItem,
  GradingBreakdown,
  ItemFeedback,
  Submission,
  SubmissionStats,
  SubmissionStatus,
  SubmissionUser,
  SubmissionsPage,
  TeacherAction,
  TeacherGradeInput,
} from '@/features/grading/domain/types'

export type {
  ActivityProgressCell,
  ActivityProgressState,
  AssessmentType,
  BatchGradeItem,
  BatchGradeRequest,
  BatchGradeResponse,
  CourseGradebookResponse,
  GradebookActivity,
  GradebookStudent,
  GradebookSummary,
  GradedItem,
  GradingBreakdown,
  ItemFeedback,
  Submission,
  SubmissionStats,
  SubmissionStatus,
  SubmissionUser,
  SubmissionsPage,
  TeacherAction,
  TeacherGradeInput,
}

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
  action_type: 'EXTEND_DEADLINE' | 'RELEASE_GRADES' | 'RETURN_ALL' | 'OVERRIDE_SCORE' | 'BATCH_GRADE'
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
