import type { QueryClient } from '@tanstack/react-query'
import { notFound, redirect } from '@tanstack/react-router'

import { ApiError } from '#/shared/api/errors'
import {
  completeActivityMutation,
  getActivityOptions,
  getCourseOptions,
  listEnrollmentsQueryKey,
  learnerCourseStateOptions,
  myCertificatesPageInfiniteQueryKey,
  myCourseCertificatesOptions,
  myCourseCertificatesQueryKey,
  uncompleteActivityMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import type { ActivityId, ActivityState, CourseId, Trail } from '#/shared/api/gen/types.gen'

import { activityKind, locate, openView, staffPreview } from './model/player'

// The same keys as the course page: one learner state per course in the cache.
export const learnerStateOptions = (id: CourseId) => learnerCourseStateOptions({ path: { course_id: id } })
/** The course page's read, for the summary's picture only. */
export const courseCoverOptions = (id: CourseId) => getCourseOptions({ path: { course_id: id } })
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
async function ensureLearner(queryClient: QueryClient, courseId: CourseId) {
  const state = await queryClient.query({ ...learnerStateOptions(courseId), staleTime: 'static' }).catch(missing)
  if (!state.enrolled && !staffPreview(state)) throw forbidden()
  return state
}

type Entry = Pick<ActivityState, 'title' | 'kind' | 'blocked_reason'>

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
  const activity = await queryClient.query({ ...activityOptions(activityId), staleTime: 'static' }).catch(missing)
  if (activity.course_id !== courseId) throw notFound()
  const entry: Entry = { title: activity.name, kind: activity.kind, blocked_reason: null }
  return { state, preview, entry }
}

/** The summary's loader: the learner state, then the course's certificates (issued on the spot when due). */
export async function ensureCompletion(queryClient: QueryClient, courseId: CourseId) {
  await ensureLearner(queryClient, courseId)
  await Promise.all([
    queryClient.query({ ...courseCertificatesOptions(courseId), staleTime: 'static' }),
    // The picture is not worth an error page: without the read the summary shows the plain field.
    queryClient.query({ ...courseCoverOptions(courseId), staleTime: 'static' }).catch(() => null),
  ])
}

// Statuses a guest's learner-state read may answer where a session would have let them in (private: 404).
const SIGN_IN_FIRST = new Set([401, 403, 404])
const toLogin = (href: string) => redirect({ to: '/login', search: { redirect: href } })

/**
 * The player's reader: the learner or staff (`ensureLearner`), or anyone not enrolled while the course is open
 * without sign-in (`guest_access`, lessons only). `signIn` is the guest's return path (null when signed in): a guest
 * anywhere else signs in first and comes back here (B-PLY-01), a signed-in visitor gets the 403 in place.
 */
async function ensureReader(queryClient: QueryClient, courseId: CourseId, signIn: string | null) {
  const state = await queryClient
    .query({ ...learnerStateOptions(courseId), staleTime: 'static' })
    .catch((error: unknown) => {
      if (signIn !== null && error instanceof ApiError && SIGN_IN_FIRST.has(error.status)) throw toLogin(signIn)
      return missing(error)
    })
  if (state.enrolled || staffPreview(state) || state.guest_access) return state
  if (signIn !== null) throw toLogin(signIn)
  throw forbidden()
}

/**
 * The player's loader: the learner state (outline, marks, locks, next step), then the content of a lesson that is
 * in this course and open to the reader. Graded work shows an entry card from the state alone. `open`: an open view
 * (`openView`), which has no AI panel.
 */
export async function ensurePlayer(
  queryClient: QueryClient,
  courseId: CourseId,
  activityId: ActivityId,
  signIn: string | null = null,
) {
  const state = await ensureReader(queryClient, courseId, signIn)
  const open = openView(state)
  const found = locate(state, activityId)
  if (!found) {
    // Staff previewing an activity the outline does not list (unpublished): its own read, a lesson of this course.
    if (!staffPreview(state)) throw notFound()
    const activity = await queryClient.query({ ...activityOptions(activityId), staleTime: 'static' }).catch(missing)
    if (activity.course_id !== courseId || activityKind(activity.kind) !== 'lesson') throw notFound()
    return { title: activity.name, open }
  }
  const { entry } = found
  if (!entry.blocked_reason && activityKind(entry.kind) === 'lesson')
    await queryClient.query({ ...activityOptions(activityId), staleTime: 'static' }).catch(missing)
  return { title: entry.title, open }
}
