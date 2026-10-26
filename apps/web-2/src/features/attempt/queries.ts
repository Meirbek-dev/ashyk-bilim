import type { QueryClient } from '@tanstack/react-query'
import { notFound, redirect } from '@tanstack/react-router'

import { ensureEntry } from '#/features/player'
import { ApiError } from '#/shared/api/errors'
import {
  attemptStateOptions,
  attemptStateQueryKey,
  getActivityAssessmentOptions,
  getSubmissionOptions,
  getSubmissionQueryKey,
  learnerCourseStateQueryKey,
  myFeedbackOptions,
  mySubmissionsOptions,
  mySubmissionsQueryKey,
  reportViolationMutation,
  saveSubmissionDraftMutation,
  startSubmissionMutation,
  submitSubmissionMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import type { ActivityId, AssessmentId, CourseId, StudentSubmission, SubmissionId } from '#/shared/api/gen/types.gen'

export const assessmentOptions = (id: ActivityId) => getActivityAssessmentOptions({ path: { activity_id: id } })
export const stateOptions = (id: AssessmentId) => attemptStateOptions({ path: { assessment_id: id } })
export const attemptsOptions = (id: AssessmentId) => mySubmissionsOptions({ path: { assessment_id: id } })
export const submissionOptions = (id: SubmissionId) => getSubmissionOptions({ path: { submission_id: id } })
export const submissionKey = (id: SubmissionId) => getSubmissionQueryKey({ path: { submission_id: id } })
export const feedbackOptions = (id: SubmissionId) => myFeedbackOptions({ path: { submission_id: id } })

// Starting or handing in changes what may happen next, the attempt list and the player's work state.
const attemptChanged = (courseId: CourseId, assessmentId: AssessmentId) => ({
  invalidates: [
    attemptStateQueryKey({ path: { assessment_id: assessmentId } }),
    mySubmissionsQueryKey({ path: { assessment_id: assessmentId } }),
    learnerCourseStateQueryKey({ path: { course_id: courseId } }),
  ],
})
export const startOptions = (courseId: CourseId, assessmentId: AssessmentId) => ({
  ...startSubmissionMutation(),
  meta: attemptChanged(courseId, assessmentId),
})
export const submitOptions = (courseId: CourseId, assessmentId: AssessmentId) => ({
  ...submitSubmissionMutation(),
  meta: attemptChanged(courseId, assessmentId),
})
// A save and a violation report answer with the attempt itself: the caller puts it in the cache.
export const saveOptions = () => ({ ...saveSubmissionDraftMutation(), meta: {} })
export const violationOptions = () => ({ ...reportViolationMutation(), meta: {} })

/**
 * The server's violation count into the cached attempt. Only the count changes; the read keeps its time, because the
 * clock counts `time_remaining_seconds` from it (useCountdown): a fresh `updatedAt` would wind the timer back by the
 * time since that read.
 */
export function noteViolations(queryClient: QueryClient, id: SubmissionId, count: number): void {
  const key = submissionKey(id)
  queryClient.setQueryData<StudentSubmission>(key, old => (old ? { ...old, violation_count: count } : old), {
    updatedAt: queryClient.getQueryState(key)?.dataUpdatedAt,
  })
}

const missing = (error: unknown): never => {
  if (error instanceof ApiError && (error.status === 404 || error.status === 422)) throw notFound()
  throw error
}

const released = (submission: StudentSubmission) =>
  submission.release_state === 'visible' || submission.release_state === 'returned_for_revision'

/**
 * The attempt route's loader: the player's rules first (enrolled, or the course's staff previewing; activity in this
 * course), then the quiz or exam behind the activity, what the learner may do with it, their attempts, and the attempt
 * in `?attempt`.
 */
export async function ensureAttempt(
  queryClient: QueryClient,
  { courseId, activityId, attemptId }: { courseId: CourseId; activityId: ActivityId; attemptId?: SubmissionId },
) {
  // The assessment and the attempt (with its feedback) are read while the player's rules are checked: four reads in
  // a row were two; the rules still decide first (their refusal is awaited before these are).
  const reading = queryClient.query({ ...assessmentOptions(activityId), staleTime: 'static' })
  const attempt = attemptId
    ? queryClient.query({ ...submissionOptions(attemptId), staleTime: 'static' }).then(async submission => {
        if (released(submission)) await queryClient.query({ ...feedbackOptions(submission.id), staleTime: 'static' })
        return submission
      })
    : null
  void reading.catch(() => null)
  void attempt?.catch(() => null)
  const { entry } = await ensureEntry(queryClient, courseId, activityId)
  // Closed to the learner (scheduled, or restricted to other groups): its test cannot be read, so the player's card
  // says why (and when it opens) instead of «not found» under a link that card itself shows.
  const assessment = await reading.catch((error: unknown) => {
    if (entry.blocked_reason) throw redirect({ to: '/learn/$courseId/$activityId', params: { courseId, activityId } })
    return missing(error)
  })
  if (assessment.kind === 'code_challenge') throw notFound()
  const [submission, state] = await Promise.all([
    attempt?.catch(missing) ?? null,
    queryClient.query({ ...stateOptions(assessment.id), staleTime: 'static' }),
    queryClient.query({ ...attemptsOptions(assessment.id), staleTime: 'static' }),
  ])
  // The entry shows how long an open draft has left (B-ATT-27): its own read, fresh each time the entry opens.
  if (!attemptId && state.can_continue && state.draft_id)
    await queryClient.query({ ...submissionOptions(state.draft_id), staleTime: 0 }).catch(() => null)
  if (submission && submission.assessment_id !== assessment.id) throw notFound()
  // The activity's name, as the learner clicked it in the contents (a test's own title often differs: B-ATT-28).
  return { title: entry.title }
}
