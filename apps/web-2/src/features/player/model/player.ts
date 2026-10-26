import type { ActivityId, ActivityState, ActivityType, LearnerCourseState } from '#/shared/api/gen/types.gen'

/**
 * Where an activity is done. `lesson`: here, marked by hand (the server accepts `POST /trail/activities/{id}`
 * only for these types). The rest live in the child route of their slice.
 */
export type ActivityKind = 'lesson' | 'attempt' | 'code' | 'submission'

const KINDS: Record<ActivityType, ActivityKind> = {
  dynamic: 'lesson',
  video: 'lesson',
  document: 'lesson',
  custom: 'lesson',
  quiz: 'attempt',
  exam: 'attempt',
  code_challenge: 'code',
  file_submission: 'submission',
}

export const activityKind = (type: ActivityType): ActivityKind => KINDS[type]

/** Course staff looking at the course as its learners do (the server's `staff_preview`): never enrolled. */
export const staffPreview = (state: LearnerCourseState) =>
  !state.enrolled && state.permissions.denial_reason === 'staff_preview'

/** The course went to the archive (the server's `course_archived`): read-only, no marks and no new work. */
export const courseArchived = (state: LearnerCourseState) => state.permissions.denial_reason === 'course_archived'

/** The activity in the learner's outline with its neighbours in outline order; null = not in this course. */
export function locate(state: LearnerCourseState, id: ActivityId) {
  const flat = state.outline.flatMap(chapter => chapter.activities)
  const index = flat.findIndex(activity => activity.id === id)
  const entry = flat[index]
  if (!entry) return null
  return { entry, prev: flat[index - 1] ?? null, next: flat[index + 1] ?? null }
}

/**
 * Where to go after handing in graded work (B-PLY-18): the next activity in contents order that is not done yet;
 * past the last one the server's next step when work is left earlier in the course, else the course summary; nothing
 * for an activity the outline does not list.
 */
export function nextStep(state: LearnerCourseState, id: ActivityId) {
  const found = locate(state, id)
  if (!found) return null
  const flat = state.outline.flatMap(chapter => chapter.activities)
  const ahead = flat.slice(flat.findIndex(activity => activity.id === id) + 1).find(activity => !activity.complete)
  if (ahead) return { kind: 'activity', activity: ahead } as const
  const left = state.next_action?.activity_id
  const pending = left && left !== id ? locate(state, left)?.entry : undefined
  return pending ? ({ kind: 'activity', activity: pending } as const) : ({ kind: 'finish' } as const)
}

/** `ActivityState.allowed_actions` an entry card can act on (the server's work-state vocabulary). */
export type EntryAction = 'start' | 'continue' | 'revise' | 'remediate' | 'view_feedback' | 'view_receipt'
const ENTRY_ACTIONS = new Set<string>(['start', 'continue', 'revise', 'remediate', 'view_feedback', 'view_receipt'])
const isEntryAction = (value: string): value is EntryAction => ENTRY_ACTIONS.has(value)

export type PlayerAction =
  | { kind: 'mark' }
  | { kind: 'continue'; activityId: ActivityId }
  | { kind: 'finish' }
  | { kind: 'open'; route: Exclude<ActivityKind, 'lesson'>; action: EntryAction }
  | null

/**
 * The player's one primary action, from the server only: the activity's state and `allowed_actions`, and after a
 * lesson is done the course's `next_action` (its `href` is a legacy URL, so the target comes from `activity_id`).
 */
export function playerAction(state: LearnerCourseState, entry: ActivityState): PlayerAction {
  if (entry.blocked_reason) return null
  const kind = activityKind(entry.activity_type)
  if (kind !== 'lesson') {
    const action = entry.allowed_actions.find(isEntryAction)
    return action ? { kind: 'open', route: kind, action } : null
  }
  // Course staff preview: the server never enrols them (409), so a mark would only fail; an archived course neither.
  if (staffPreview(state) || courseArchived(state)) return null
  if (!entry.complete) return { kind: 'mark' }
  const next = state.next_action
  if (!next?.enabled) return null
  if (next.id === 'view_certificate' || next.id === 'review_completion') return { kind: 'finish' }
  if (next.activity_id && next.activity_id !== entry.id) return { kind: 'continue', activityId: next.activity_id }
  return null
}
