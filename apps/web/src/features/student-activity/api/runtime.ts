import { toAppActivityType } from '@/hooks/courses/courseKeys'
import { apiJson } from '@/lib/api-client'
import { unixToIso } from '@/lib/api/contract'
import { LearnerCourseState } from '@/lib/api/generated/zod'

export type StudentActivityState =
  | 'not_started'
  | 'in_progress'
  | 'viewed'
  | 'draft'
  | 'submitted'
  | 'needs_grading'
  | 'graded_hidden'
  | 'published'
  | 'returned'
  | 'passed'
  | 'failed'
  | 'complete'
  | 'locked'
  | 'unavailable'
  | 'attempt_exhausted'
  | 'course_end'

export interface StudentActivityActionRequest {
  command: 'mark_complete' | 'unmark_complete'
  payload?: Record<string, unknown>
}

interface RuntimeNavItem {
  complete: boolean
  id: string
  published: boolean
  state: StudentActivityState
  title: string
  type: string
  uuid: string
}

export interface StudentActivityRuntime {
  activity: (RuntimeNavItem & { chapter_id: string; chapter_title?: string; order: number; subtype: string }) | null
  content: {
    assessment_uuid?: string | null
    content?: Record<string, unknown>
    details?: Record<string, unknown>
    file_submission_uuid?: string | null
    settings?: Record<string, unknown>
    subtype: string
    type: string
  } | null
  course: { id: string; public: boolean; title: string; uuid: string }
  next?: RuntimeNavItem | null
  outline?: { activities?: RuntimeNavItem[]; id: string; index: number; title: string }[]
  permissions: { can_contribute: boolean; can_update: boolean; can_view: boolean; is_authenticated: boolean }
  policy?: {
    completion_rule?: string | null
    due_at?: string | null
    grade_release_mode?: string | null
    grading_mode?: string | null
    max_attempts?: number | null
    passing_score?: number | null
    time_limit_seconds?: number | null
  } | null
  previous?: RuntimeNavItem | null
  primary_action: {
    enabled: boolean
    id:
      | 'start'
      | 'continue'
      | 'mark_complete'
      | 'unmark_complete'
      | 'submit'
      | 'view_receipt'
      | 'view_feedback'
      | 'revise'
      | 'next_activity'
      | 'review_policy'
      | 'back_to_course'
      | 'none'
    reason?: string | null
    target_activity_uuid?: string | null
  }
  progress: {
    attempt_count: number
    canonical_state?: string | null
    complete: boolean
    completed_at?: string | null
    due_at?: string | null
    graded_at?: string | null
    is_late: boolean
    latest_submission_status?: string | null
    latest_submission_uuid?: string | null
    passed?: boolean | null
    score?: number | null
    state: StudentActivityState
    status_reason?: string | null
    submitted_at?: string | null
    teacher_action_required: boolean
  }
}

type OutlineActivity = LearnerCourseState['outline'][number]['activities'][number]

function toNavItem(activity: OutlineActivity): RuntimeNavItem {
  return {
    complete: activity.complete,
    id: activity.id,
    published: activity.available,
    state: activity.available ? activity.state : 'unavailable',
    title: activity.title,
    type: toAppActivityType(activity.activity_type),
    uuid: activity.id,
  }
}

const VIEW_STATES = new Set<StudentActivityState>([
  'submitted',
  'needs_grading',
  'graded_hidden',
  'published',
  'passed',
  'failed',
])

function primaryAction(current: OutlineActivity, next: RuntimeNavItem | null): StudentActivityRuntime['primary_action'] {
  if (!current.available || current.state === 'locked') {
    return {
      id: 'none',
      enabled: false,
      ...(current.blocked_reason === undefined ? {} : { reason: current.blocked_reason }),
    }
  }
  // A hand-in, a pending grade or a released result is this page's content:
  // «Посмотреть квитанцию» / «Смотреть результат» had nothing to open (UX-033),
  // so the bar moves the learner on instead.
  if (current.complete || VIEW_STATES.has(current.state)) {
    return next
      ? { id: 'next_activity', enabled: next.published && next.state !== 'locked', target_activity_uuid: next.uuid }
      : { id: 'back_to_course', enabled: true }
  }
  if (['dynamic', 'video', 'document', 'custom'].includes(current.activity_type)) {
    return { id: 'mark_complete', enabled: true }
  }
  const actionByState: Partial<Record<StudentActivityState, StudentActivityRuntime['primary_action']['id']>> = {
    in_progress: 'continue',
    returned: 'revise',
  }
  const id = actionByState[current.state] ?? 'start'
  return { id, enabled: current.allowed_actions.includes(id) }
}

/** `null` when the activity is not in the learner outline (unpublished or foreign). */
function toRuntime(state: LearnerCourseState, activityId: string): StudentActivityRuntime | null {
  const outline = state.outline.map(chapter => ({
    id: chapter.id,
    index: chapter.index,
    title: chapter.title,
    activities: chapter.activities.map(toNavItem),
  }))
  const flat = state.outline.flatMap(chapter =>
    chapter.activities.map((activity, index) => ({ activity, chapter, index })),
  )
  const currentIndex = flat.findIndex(item => item.activity.id === activityId)
  const currentEntry = currentIndex !== -1 ? flat[currentIndex] : undefined
  if (!currentEntry) return null

  const { activity, chapter, index } = currentEntry
  const previous = currentIndex > 0 ? toNavItem(flat[currentIndex - 1]!.activity) : null
  const next = currentIndex + 1 < flat.length ? toNavItem(flat[currentIndex + 1]!.activity) : null
  const dueAt = unixToIso(activity.due_at_unix)

  return {
    activity: {
      ...toNavItem(activity),
      chapter_id: chapter.id,
      chapter_title: chapter.title,
      order: index,
      subtype: '',
    },
    content: null,
    course: { id: state.course_id, uuid: state.course_id, title: state.title, public: state.public },
    outline,
    permissions: {
      is_authenticated: true,
      can_view: state.permissions.can_access,
      can_contribute: false,
      can_update: false,
    },
    policy: { due_at: dueAt },
    previous,
    next,
    primary_action: primaryAction(activity, next),
    progress: {
      state: activity.available ? activity.state : 'unavailable',
      complete: activity.complete,
      ...(activity.score === undefined ? {} : { score: activity.score }),
      ...(activity.passed === undefined ? {} : { passed: activity.passed }),
      due_at: dueAt,
      is_late: activity.is_late,
      teacher_action_required: activity.state === 'needs_grading',
      attempt_count: 0,
      ...(activity.blocked_reason === undefined ? {} : { status_reason: activity.blocked_reason }),
    },
  }
}

export async function getStudentActivityRuntime(courseUuid: string, activityUuid: string) {
  const state = await apiJson(
    `courses/${courseUuid}/learner-state`,
    {},
    value => LearnerCourseState.parse(value),
  )
  return toRuntime(state, activityUuid)
}

export async function runStudentActivityAction(
  courseUuid: string,
  activityUuid: string,
  action: StudentActivityActionRequest,
): Promise<StudentActivityRuntime> {
  if (action.command === 'mark_complete') {
    await apiJson(`trail/activities/${activityUuid}`, { method: 'POST' })
  } else if (action.command === 'unmark_complete') {
    await apiJson(`trail/activities/${activityUuid}`, { method: 'DELETE' })
  } else {
    throw new Error('Unsupported activity command')
  }
  const runtime = await getStudentActivityRuntime(courseUuid, activityUuid)
  if (!runtime) throw new Error(`Activity ${activityUuid} is not in course ${courseUuid}`)
  return runtime
}
