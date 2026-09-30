/**
 * ActivityProgress — teacher-facing learner/activity projection.
 *
 * Derived from submission status + policy state (due date, passing score, etc.).
 * This is read-only for the teacher; it is never stored directly.
 *
 * Re-exports the generated type and provides display helpers.
 */

export type ActivityProgressState =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'NEEDS_GRADING'
  | 'RETURNED'
  | 'GRADED'
  | 'PASSED'
  | 'FAILED'
  | 'COMPLETED'

export interface ActivityProgressCell {
  activity_id: string
  attempt_count?: number
  completed_at?: string | null
  due_at?: string | null
  is_late?: boolean
  latest_submission_status?: string | null
  latest_submission_uuid?: string | null
  passed?: boolean | null
  score?: number | null
  state: ActivityProgressState
  teacher_action_required?: boolean
  user_id: string
}
