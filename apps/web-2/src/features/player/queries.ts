import type { QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

import { ApiError } from '#/shared/api/errors'
import {
  completeActivityMutation,
  getActivityOptions,
  listEnrollmentsQueryKey,
  learnerCourseStateOptions,
  myCertificatesPageInfiniteQueryKey,
  myCourseCertificatesOptions,
  myCourseCertificatesQueryKey,
  uncompleteActivityMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import type { ActivityId, ActivityState, CourseId, Trail } from '#/shared/api/gen/types.gen'

import { activityKind, locate, staffPreview } from './model/player'

// The same keys as the course page: one learner state per course in the cache.
export const learnerStateOptions = (id: CourseId) => learnerCourseStateOptions({ path: { course_id: id } })
export const activityOptions = (id: ActivityId) => getActivityOptions({ path: { activity_id: id } })
/** The caller's certificates for the course: reading them issues one to a finished course that has none yet. */
export const courseCertificatesOptions = (id: CourseId) => myCourseCertificatesOptions({ path: { course_id: id } })

// Marks with `Prefer: return=representation` answer the Trail with the course's `learner_state`: the cache takes
// it; "my courses" and the certificates (a finished course issues one on the spot) are read again.
const withState = { headers: { Prefer: 'return=representation' } }
const progress = (queryClient: QueryClient, courseId: CourseId) => ({
  onSuccess: ({ learner_state: state }: Trail) => {
    if (state) queryClient.setQueryData(learnerStateOptions(courseId).queryKey, state)
  },
  meta: {
    invalidates: [
      listEnrollmentsQueryKey(),
      myCertificatesPageInfiniteQueryKey(),
      myCourseCertificatesQueryKey({ path: { course_id: courseId } }),
    ],
  },
})
export const markOptions = (queryClient: QueryClient, courseId: CourseId) => ({
  ...completeActivityMutation(withState),
  ...progress(queryClient, courseId),
})
export const unmarkOptions = (queryClient: QueryClient, courseId: CourseId) => ({
  ...uncompleteActivityMutation(withState),
  ...progress(queryClient, courseId),
})

const forbidden = () =>
  new ApiError({ status: 403, code: 'forbidden', fieldErrors: [], requestId: null, retryAfter: null })

const missing = (error: unknown) => {
  if (error instanceof ApiError && (error.status === 404 || error.status === 422)) throw notFound()
  throw error
}

/**
 * The learner state of an enrolled learner, or of the course's staff previewing it as a learner (their attempts are
 * previews: never counted, never graded); anyone else (not enrolled, no access) gets a 403 in place.
 */
export async function ensureLearner(queryClient: QueryClient, courseId: CourseId) {
  const state = await queryClient.ensureQueryData(learnerStateOptions(courseId)).catch(missing)
  if (!state.enrolled && !staffPreview(state)) throw forbidden()
  return state
}

type Entry = Pick<ActivityState, 'title' | 'activity_type' | 'blocked_reason'>

/**
 * An activity of the course as its learner sees it: the outline entry (`blocked_reason` closes it). Staff previewing
 * see every activity open, an unpublished one too (its own read: the outline lists only what learners see).
 */
export async function ensureEntry(queryClient: QueryClient, courseId: CourseId, activityId: ActivityId) {
  const state = await ensureLearner(queryClient, courseId)
  const preview = staffPreview(state)
  const listed = locate(state, activityId)?.entry
  if (listed) return { state, preview, entry: preview ? { ...listed, blocked_reason: null } : (listed as Entry) }
  if (!preview) throw notFound()
  const activity = await queryClient.ensureQueryData(activityOptions(activityId)).catch(missing)
  if (activity.course_id !== courseId) throw notFound()
  const entry: Entry = { title: activity.name, activity_type: activity.activity_type, blocked_reason: null }
  return { state, preview, entry }
}

/** The summary's loader: the learner state, then the course's certificates (issued on the spot when due). */
export async function ensureCompletion(queryClient: QueryClient, courseId: CourseId) {
  await ensureLearner(queryClient, courseId)
  await queryClient.ensureQueryData(courseCertificatesOptions(courseId))
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
