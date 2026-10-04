import type { QueryKey } from '@tanstack/react-query'

import {
  agendaQueryKey,
  assessmentReviewQueueQueryKey,
  attemptStateQueryKey,
  dashboardQueryKey,
  fileSubmissionReviewQueueQueryKey,
  getActivityAssessmentQueryKey,
  getActivityFileSubmissionQueryKey,
  getAttemptQueryKey,
  getSubmissionQueryKey,
  listEnrollmentsQueryKey,
  gradebookQueryKey,
  gradingHistoryQueryKey,
  itemAnalyticsQueryKey,
  leaderboardInfiniteQueryKey,
  learnerCourseStateQueryKey,
  myAttemptsQueryKey,
  myFeedbackQueryKey,
  mySubmissionsQueryKey,
  reviewSubmissionQueryKey,
  statsQueryKey,
  workQueueInfiniteQueryKey,
  xpHistoryInfiniteQueryKey,
} from './gen/@tanstack/react-query.gen'
import type { UserStreamEvent } from './gen/types.gen'

/** A data event of `GET /me/events` (the `connected` and `closed` control messages carry none). */
export type UserEvent = Extract<UserStreamEvent, { event_id: string }>
/** The closed set of user events (contract `UserStreamEvent`). */
export type EventType = UserEvent['event']
type Payloads = { [E in UserEvent as E['event']]: E['payload'] }
export type EventInvalidations = { [T in EventType]: (payload: Payloads[T]) => QueryKey[] }

/**
 * Every cached variant of an operation (any path, query or page): its generated key cut to the operation id. For
 * keys whose path id the payload does not carry (an assessment or a file task is known here only by its activity).
 */
const anyOf = ([{ _id }]: readonly [{ _id: string }]): QueryKey => [{ _id }]
const UNKNOWN = ''

/**
 * Spec 7.7: which cached reads an event makes stale. A new event in the contract without a row here does not
 * compile. Notification events change the cache themselves (the payload is the item or the count): a refetch would
 * only repeat what the event says.
 */
export const eventInvalidations = {
  // A grader's copy of the course grading stream: the queues, the gradebook, the results and the work itself.
  'grading.updated': ({ course_id, submission_id, attempt_id }) => [
    workQueueInfiniteQueryKey(),
    anyOf(assessmentReviewQueueQueryKey({ path: { assessment_id: UNKNOWN } })),
    anyOf(fileSubmissionReviewQueueQueryKey({ path: { file_submission_id: UNKNOWN } })),
    gradebookQueryKey({ path: { course_id } }),
    anyOf(statsQueryKey({ path: { assessment_id: UNKNOWN } })),
    anyOf(itemAnalyticsQueryKey({ path: { assessment_id: UNKNOWN } })),
    ...(submission_id
      ? [
          getSubmissionQueryKey({ path: { submission_id } }),
          reviewSubmissionQueryKey({ path: { submission_id } }),
          gradingHistoryQueryKey({ path: { submission_id } }),
        ]
      : []),
    ...(attempt_id ? [getAttemptQueryKey({ path: { attempt_id } })] : []),
  ],
  // The learner's own work: progress, the trail, "Today", the task, its attempt state (quiz, exam, code) and submissions.
  'submission.updated': ({ course_id, activity_id, submission_id, attempt_id }) => [
    learnerCourseStateQueryKey({ path: { course_id } }),
    listEnrollmentsQueryKey(),
    agendaQueryKey(),
    workQueueInfiniteQueryKey(),
    getActivityAssessmentQueryKey({ path: { activity_id } }),
    getActivityFileSubmissionQueryKey({ path: { activity_id } }),
    anyOf(attemptStateQueryKey({ path: { assessment_id: UNKNOWN } })),
    ...(submission_id
      ? [
          getSubmissionQueryKey({ path: { submission_id } }),
          myFeedbackQueryKey({ path: { submission_id } }),
          anyOf(mySubmissionsQueryKey({ path: { assessment_id: UNKNOWN } })),
        ]
      : []),
    ...(attempt_id
      ? [
          getAttemptQueryKey({ path: { attempt_id } }),
          anyOf(myAttemptsQueryKey({ path: { file_submission_id: UNKNOWN } })),
        ]
      : []),
  ],
  // The learner's own due date on one activity moved (an extension or a personal exception): wherever it is shown.
  'deadline.extended': ({ course_id, activity_id }) => [
    learnerCourseStateQueryKey({ path: { course_id } }),
    agendaQueryKey(),
    getActivityAssessmentQueryKey({ path: { activity_id } }),
    getActivityFileSubmissionQueryKey({ path: { activity_id } }),
    anyOf(attemptStateQueryKey({ path: { assessment_id: UNKNOWN } })),
  ],
  'notification.created': () => [],
  'notification.read': () => [],
  'xp.awarded': () => [dashboardQueryKey(), leaderboardInfiniteQueryKey(), xpHistoryInfiniteQueryKey()],
} satisfies EventInvalidations

/** The keys one event makes stale; an event this build does not know (a newer server) touches nothing. */
export function invalidationsFor<T extends EventType>(type: T, payload: Payloads[T]): QueryKey[] {
  const table: EventInvalidations = eventInvalidations
  return Object.hasOwn(table, type) ? table[type](payload) : []
}

const isTaskRead = (data: unknown): data is { id: string; activity_id: string } =>
  typeof data === 'object' &&
  data !== null &&
  'id' in data &&
  'activity_id' in data &&
  typeof data.id === 'string' &&
  typeof data.activity_id === 'string'

/** The assessment or file task a cached read is keyed by (its path), if any. */
function taskOf(queryKey: QueryKey): string | undefined {
  const [head] = queryKey
  if (typeof head !== 'object' || head === null || !('path' in head)) return undefined
  const { path } = head
  if (typeof path !== 'object' || path === null) return undefined
  const id =
    'assessment_id' in path ? path.assessment_id : 'file_submission_id' in path ? path.file_submission_id : null
  return typeof id === 'string' ? id : undefined
}

/**
 * Whether a read keyed by an assessment or file task (`anyOf` rows above) belongs to another activity than the
 * event's: the task's activity comes from its cached read (`id` + `activity_id`); unknown counts as the same.
 */
export function aboutOtherActivity(queryKey: QueryKey, activityId: string, cached: readonly unknown[]): boolean {
  const task = taskOf(queryKey)
  if (task === undefined) return false
  const owner = cached.find(data => isTaskRead(data) && data.id === task)
  return isTaskRead(owner) && owner.activity_id !== activityId
}
