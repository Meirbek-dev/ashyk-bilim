import type { QueryKey } from '@tanstack/react-query'

import {
  agendaQueryKey,
  assessmentReviewQueueQueryKey,
  dashboardQueryKey,
  fileSubmissionReviewQueueQueryKey,
  getActivityAssessmentQueryKey,
  getActivityFileSubmissionQueryKey,
  getAttemptQueryKey,
  getSubmissionQueryKey,
  getTrailQueryKey,
  gradebookQueryKey,
  gradingHistoryQueryKey,
  leaderboardInfiniteQueryKey,
  learnerCourseStateQueryKey,
  myAttemptsQueryKey,
  myFeedbackQueryKey,
  mySubmissionsQueryKey,
  workQueueInfiniteQueryKey,
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
  // A grader's copy of the course grading stream: the queues, the gradebook and the work itself.
  'grading.updated': ({ course_id, submission_id, attempt_id }) => [
    workQueueInfiniteQueryKey(),
    anyOf(assessmentReviewQueueQueryKey({ path: { assessment_id: UNKNOWN } })),
    anyOf(fileSubmissionReviewQueueQueryKey({ path: { file_submission_id: UNKNOWN } })),
    gradebookQueryKey({ path: { course_id } }),
    ...(submission_id
      ? [getSubmissionQueryKey({ path: { submission_id } }), gradingHistoryQueryKey({ path: { submission_id } })]
      : []),
    ...(attempt_id ? [getAttemptQueryKey({ path: { attempt_id } })] : []),
  ],
  // The learner's own work: progress, the trail, "Today", the task and its submissions.
  'submission.updated': ({ course_id, activity_id, submission_id, attempt_id }) => [
    learnerCourseStateQueryKey({ path: { course_id } }),
    getTrailQueryKey(),
    agendaQueryKey(),
    workQueueInfiniteQueryKey(),
    getActivityAssessmentQueryKey({ path: { activity_id } }),
    getActivityFileSubmissionQueryKey({ path: { activity_id } }),
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
  'notification.created': () => [],
  'notification.read': () => [],
  'xp.awarded': () => [dashboardQueryKey(), leaderboardInfiniteQueryKey()],
} satisfies EventInvalidations

/** The keys one event makes stale; an event this build does not know (a newer server) touches nothing. */
export function invalidationsFor<T extends EventType>(type: T, payload: Payloads[T]): QueryKey[] {
  const table: EventInvalidations = eventInvalidations
  return Object.hasOwn(table, type) ? table[type](payload) : []
}
