import type { QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

import { ApiError } from '#/shared/api/errors'
import {
  addActivityMutation,
  getActivityOptions,
  getTrailQueryKey,
  learnerCourseStateOptions,
  learnerCourseStateQueryKey,
  myCertificatesQueryKey,
  removeActivityMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import type { ActivityId, CourseId } from '#/shared/api/gen/types.gen'

import { activityKind, locate } from './model/player'

// The same keys as the course page: one learner state per course in the cache.
export const learnerStateOptions = (id: CourseId) => learnerCourseStateOptions({ path: { id } })
export const activityOptions = (id: ActivityId) => getActivityOptions({ path: { id } })

// Marks answer a Trail, not the learner state: the state, "my courses" and certificates (a finished course
// issues one on the spot) are read again.
const progress = (courseId: CourseId) => ({
  invalidates: [learnerCourseStateQueryKey({ path: { id: courseId } }), getTrailQueryKey(), myCertificatesQueryKey()],
})
export const markOptions = (courseId: CourseId) => ({ ...addActivityMutation(), meta: progress(courseId) })
export const unmarkOptions = (courseId: CourseId) => ({ ...removeActivityMutation(), meta: progress(courseId) })

const forbidden = () =>
  new ApiError({ status: 403, code: 'forbidden', fieldErrors: [], requestId: null, retryAfter: null })

const missing = (error: unknown) => {
  if (error instanceof ApiError && (error.status === 404 || error.status === 422)) throw notFound()
  throw error
}

/** The learner state of an enrolled learner; anyone else (staff, not enrolled, no access) gets a 403 in place. */
export async function ensureLearner(queryClient: QueryClient, courseId: CourseId) {
  const state = await queryClient.ensureQueryData(learnerStateOptions(courseId)).catch(missing)
  if (!state.enrolled) throw forbidden()
  return state
}

/**
 * The player's loader: the learner state (outline, marks, locks, next step), then the content of a lesson that is
 * in this course and open to the learner. Graded work shows an entry card from the state alone.
 */
export async function ensurePlayer(queryClient: QueryClient, courseId: CourseId, activityId: ActivityId) {
  const state = await ensureLearner(queryClient, courseId)
  const found = locate(state, activityId)
  if (!found) throw notFound()
  const { entry } = found
  if (!entry.blocked_reason && activityKind(entry.activity_type) === 'lesson')
    await queryClient.ensureQueryData(activityOptions(activityId)).catch(missing)
  return { title: entry.title }
}
