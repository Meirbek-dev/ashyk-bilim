import type { QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

import { ensurePlayer } from '#/features/player'
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

const missing = (error: unknown): never => {
  if (error instanceof ApiError && (error.status === 404 || error.status === 422)) throw notFound()
  throw error
}

const released = (submission: StudentSubmission) =>
  submission.release_state === 'visible' || submission.release_state === 'returned_for_revision'

/**
 * The attempt route's loader: the player's rules first (enrolled only, activity in this course), then the quiz or
 * exam behind the activity, what the learner may do with it, their attempts, and the attempt in `?attempt`.
 */
export async function ensureAttempt(
  queryClient: QueryClient,
  { courseId, activityId, attemptId }: { courseId: CourseId; activityId: ActivityId; attemptId?: SubmissionId },
) {
  await ensurePlayer(queryClient, courseId, activityId)
  const assessment = await queryClient.ensureQueryData(assessmentOptions(activityId)).catch(missing)
  if (assessment.kind === 'code_challenge') throw notFound()
  const [submission] = await Promise.all([
    attemptId ? queryClient.ensureQueryData(submissionOptions(attemptId)).catch(missing) : null,
    queryClient.ensureQueryData(stateOptions(assessment.id)),
    queryClient.ensureQueryData(attemptsOptions(assessment.id)),
  ])
  if (submission && submission.assessment_id !== assessment.id) throw notFound()
  if (submission && released(submission)) await queryClient.ensureQueryData(feedbackOptions(submission.id))
  return { title: assessment.title }
}
