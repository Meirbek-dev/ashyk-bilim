import type {
  ActionId,
  ActivityId,
  Contributor,
  Course,
  Curriculum,
  LearnerCourseState,
  UserId,
} from '#/shared/api/gen/types.gen'

/**
 * The page header's one primary action (spec 5.4), decided only from what the API answered:
 * the learner state's `permissions` and `next_action`, and the course's `allowed_actions`.
 */
export type PrimaryAction =
  | { kind: 'login' }
  | { kind: 'enroll' }
  | { kind: 'activity'; action: ActivityActionId; activityId: ActivityId }
  | { kind: 'complete'; action: 'view_certificate' | 'review_completion' }
  | { kind: 'workspace' }
  | null

/** `next_action.id` values that point at an activity of the course. */
export type ActivityActionId = Extract<ActionId, 'start' | 'continue' | 'revise' | 'view_feedback' | 'wait_for_grade'>

const ACTIVITY_ACTIONS = new Set<ActionId>(['start', 'continue', 'revise', 'view_feedback', 'wait_for_grade'])
const isActivityAction = (id: ActionId): id is ActivityActionId => ACTIVITY_ACTIONS.has(id)

export function primaryAction(
  course: Pick<Course, 'allowed_actions'>,
  state: LearnerCourseState | null,
): PrimaryAction {
  if (!state) return { kind: 'login' }
  const next = state.next_action
  if (state.enrolled && next?.enabled) {
    if (next.activity_id && isActivityAction(next.id))
      return { kind: 'activity', action: next.id, activityId: next.activity_id }
    if (next.id === 'view_certificate' || next.id === 'review_completion') return { kind: 'complete', action: next.id }
  }
  if (!state.enrolled && state.permissions.can_enroll) return { kind: 'enroll' }
  // Staff never enrol (BUG-287): their way into the course is the workspace.
  if (!state.enrolled && course.allowed_actions.includes('update')) return { kind: 'workspace' }
  return null
}

/** One syllabus row: the same shape from the guest's curriculum and from the learner's outline. */
type SyllabusActivity = { id: ActivityId; title: string; type: string; complete: boolean; available: boolean }
export type SyllabusChapter = { id: string; title: string; activities: SyllabusActivity[] }

/** A guest's syllabus: published activities only, chapters left without any are dropped. */
export function curriculumSyllabus(curriculum: Curriculum): SyllabusChapter[] {
  return curriculum.chapters
    .map(chapter => ({
      id: chapter.id,
      title: chapter.name,
      activities: chapter.activities
        .filter(activity => activity.published)
        .map(activity => ({
          id: activity.id,
          title: activity.name,
          type: activity.activity_type,
          complete: false,
          available: false,
        })),
    }))
    .filter(chapter => chapter.activities.length > 0)
}

/** A signed-in user's syllabus with the server's per-activity state. */
export const outlineSyllabus = (state: LearnerCourseState): SyllabusChapter[] =>
  state.outline.map(chapter => ({
    id: chapter.id,
    title: chapter.title,
    activities: chapter.activities.map(activity => ({
      id: activity.id,
      title: activity.title,
      type: activity.activity_type,
      complete: activity.complete,
      available: state.enrolled && activity.available,
    })),
  }))

const ROLE_ORDER = ['creator', 'maintainer', 'contributor']

/** Names for the header: active authors, creator first; reporters are read-only and never authors (BUG-146). */
export const authorNames = (roster: Contributor[]): string[] =>
  roster
    .filter(row => row.status === 'active' && ROLE_ORDER.includes(row.role))
    .toSorted((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
    .map(row => row.display_name)

/** What the contributor block offers: the roster lists the caller's own row (BUG-331). */
export type Application = 'apply' | 'pending' | null

export function application(course: Course, roster: Contributor[], userId: UserId | null): Application {
  if (!userId || !course.open_to_contributors || course.archived_at_unix) return null
  const own = roster.find(row => row.user_id === userId)
  if (!own) return 'apply'
  return own.status === 'pending' ? 'pending' : null
}
