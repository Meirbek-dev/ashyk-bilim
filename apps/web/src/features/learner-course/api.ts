import { queryOptions } from '@tanstack/react-query'

import { apiJson } from '@/lib/api-client'

export type LearnerWorkState =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'needs_grading'
  | 'graded_hidden'
  | 'returned'
  | 'passed'
  | 'failed'
  | 'complete'
  | 'locked'

export interface LearnerCourseActivityState {
  id: number
  uuid: string
  title: string
  type: string
  required: boolean
  state: LearnerWorkState
  complete: boolean
  score?: number | null
  passed?: boolean | null
  due_at?: string | null
  is_late: boolean
  available: boolean
  blocked_reason?: string | null
  allowed_actions: string[]
}

export interface LearnerCourseState {
  course_id: number
  course_uuid: string
  title: string
  public: boolean
  enrolled: boolean
  enrollment_state: 'not_enrolled' | 'in_progress' | 'completed'
  permissions: {
    can_discover: boolean
    can_access: boolean
    can_enroll: boolean
    denial_reason?: string | null
  }
  progress: {
    completed_required_count: number
    total_required_count: number
    missing_required_count: number
    needs_grading_count: number
    progress_pct: number
    grade_average?: number | null
    completed_at?: string | null
  }
  certificate: {
    configured: boolean
    eligible: boolean
    issued: boolean
    user_certification_uuid?: string | null
    href?: string | null
  }
  next_action: {
    id: string
    label: string
    reason: string
    enabled: boolean
    activity_uuid?: string | null
    href?: string | null
  }
  outline: {
    id: number
    uuid: string
    title: string
    index: number
    activities: LearnerCourseActivityState[]
  }[]
}

export const learnerCourseStateQueryOptions = (courseUuid: string, enabled = true) =>
  queryOptions({
    queryKey: ['learner-course', courseUuid, 'state'],
    queryFn: () => apiJson<LearnerCourseState>(`courses/${courseUuid}/learner-state`),
    enabled: enabled && Boolean(courseUuid),
    staleTime: 15_000,
  })
