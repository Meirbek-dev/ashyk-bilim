import type {
  ActionId,
  ActivityId,
  Contributor,
  Course,
  Curriculum,
  LearnerCourseState,
  NextActionReason,
  UserId,
  WorkState,
} from '#/shared/api/gen/types.gen'
import { activityType, activityTypeMeta } from '#/shared/i18n/labels'

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
    if (next.activity_id && isActivityAction(next.id)) {
      // "Start" names the next activity; for a course already under way the header says "Continue" (the course).
      const action = next.id === 'start' && state.progress.completed_required_count > 0 ? 'continue' : next.id
      return { kind: 'activity', action, activityId: next.activity_id }
    }
    if (next.id === 'view_certificate' || next.id === 'review_completion') return { kind: 'complete', action: next.id }
  }
  if (!state.enrolled && state.permissions.can_enroll) return { kind: 'enroll' }
  // Staff never enrol (BUG-287): their way into the course is the workspace.
  if (!state.enrolled && course.allowed_actions.includes('update')) return { kind: 'workspace' }
  return null
}

/** One syllabus row: the same shape from the guest's curriculum and from the learner's outline. */
export type SyllabusActivity = {
  id: ActivityId
  title: string
  type: string
  complete: boolean
  available: boolean
  /** A scheduled test: when it opens (listed, not openable until then). */
  opensAt: number | null
  /** The learner's work on it (the server's): unfinished work in flight is named on the row. */
  work: WorkState
  /** The learner's due date (their extension if any) while the work is still theirs to do; `past` once it went by. */
  due: { at: number; past: boolean } | null
}
export type SyllabusChapter = { id: string; title: string; activities: SyllabusActivity[] }

/** A guest's syllabus: published activities only, chapters left without any are dropped. */
export function curriculumSyllabus(curriculum: Curriculum): SyllabusChapter[] {
  return curriculum.chapters
    .map(chapter => ({
      id: chapter.id,
      title: chapter.name,
      activities: chapter.activities
        .filter(activity => activity.published)
        .map((activity): SyllabusActivity => ({
          id: activity.id,
          title: activity.name,
          type: activity.activity_type,
          complete: false,
          available: false,
          opensAt: null,
          work: 'not_started',
          due: null,
        })),
    }))
    .filter(chapter => chapter.activities.length > 0)
}

// Work still the learner's to do: a due date means something to them only then (handed-in work waits on the teacher).
const OPEN_WORK = new Set<WorkState>(['not_started', 'in_progress', 'returned'])

/**
 * A signed-in user's syllabus with the server's per-activity state. Rows link into the player for an enrolled learner,
 * and for the course's staff (`staff`), who reach this page by «Предпросмотр как у учащегося» (B-CRS-19). An enrolled
 * learner's open work carries its due date (B-CRS-21), past or not as of `nowUnix` (when the state was read).
 */
export const outlineSyllabus = (state: LearnerCourseState, staff = false, nowUnix = 0): SyllabusChapter[] =>
  state.outline.map(chapter => ({
    id: chapter.id,
    title: chapter.title,
    activities: chapter.activities.map(activity => ({
      id: activity.id,
      title: activity.title,
      type: activity.activity_type,
      complete: activity.complete,
      available: (state.enrolled || staff) && activity.available,
      opensAt: activity.opens_at_unix,
      work: activity.state,
      due:
        state.enrolled && !activity.complete && activity.due_at_unix !== null && OPEN_WORK.has(activity.state)
          ? { at: activity.due_at_unix, past: activity.due_at_unix <= nowUnix }
          : null,
    })),
  }))

/** Why the server put an activity before the next one in order: «Далее» names it (B-CRS-17). */
export type NextReason = Extract<NextActionReason, 'overdue' | 'due_soon' | 'returned_for_revision' | 'in_progress'>
const NEXT_REASONS = new Set<NextActionReason>(['overdue', 'due_soon', 'returned_for_revision', 'in_progress'])
const isNextReason = (reason: NextActionReason): reason is NextReason => NEXT_REASONS.has(reason)

/** The activity the server's `next_action` points at, with its type, for «Далее: …» under the progress (B-CRS-17). */
export function nextActivity(
  state: LearnerCourseState,
): { id: ActivityId; title: string; type: string; reason: NextReason | null } | null {
  const next = state.next_action
  const id = next?.activity_id
  if (!next || !id) return null
  const found = state.outline.flatMap(chapter => chapter.activities).find(activity => activity.id === id)
  if (!found) return null
  return {
    id: found.id,
    title: found.title,
    type: found.activity_type,
    reason: isNextReason(next.reason) ? next.reason : null,
  }
}

const ROLE_ORDER = ['creator', 'maintainer', 'contributor']

/** Names for the header: active authors, creator first; reporters are read-only and never authors (BUG-146). */
/** The course's size as the syllabus lists it (B-CRS-14): chapters and activities. */
export const syllabusSize = (chapters: SyllabusChapter[]) => {
  const all = chapters.flatMap(chapter => chapter.activities.map(activity => activityType(activity.type)))
  return {
    chapters: chapters.length,
    activities: all.length,
    /** What the course is made of (B-CRS-15), in the type table's order: «Видео: 12 · Документ: 15 · Экзамен: 1». */
    byType: Object.keys(activityTypeMeta)
      .map(activityType)
      .map(type => [type, all.filter(one => one === type).length] as const)
      .filter(([, count]) => count > 0),
  }
}

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

/** Work in flight a syllabus row names (B-CRS-18): started, handed in, returned or failed; done and untouched rows say nothing. */
export type InFlight = 'in_progress' | 'submitted' | 'needs_grading' | 'graded_hidden' | 'returned' | 'failed'
const IN_FLIGHT = new Set<WorkState>([
  'in_progress',
  'submitted',
  'needs_grading',
  'graded_hidden',
  'returned',
  'failed',
])
const isInFlight = (work: WorkState): work is InFlight => IN_FLIGHT.has(work)
export const inFlight = ({ complete, work }: Pick<SyllabusActivity, 'complete' | 'work'>): InFlight | null =>
  !complete && isInFlight(work) ? work : null

/** What the course page says about its certificate (B-CRS-20): offered, the learner's own (its code), or nothing. */
export function certificateLine(state: Pick<LearnerCourseState, 'certificate'>) {
  const { configured, verify_code: code } = state.certificate
  if (!configured) return null
  return code ? ({ kind: 'yours', code } as const) : ({ kind: 'offered' } as const)
}
