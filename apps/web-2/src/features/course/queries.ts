import type { QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

import { ApiError } from '#/shared/api/errors'
import {
  addCourseMutation,
  applyContributorMutation,
  getCourseOptions,
  getCurriculumOptions,
  getTrailQueryKey,
  learnerCourseStateOptions,
  learnerCourseStateQueryKey,
  listContributorsOptions,
  listCourseUpdatesOptions,
  removeContributorMutation,
  removeCourseMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import type { Contributor, CourseId, SessionInfo, UserId } from '#/shared/api/gen/types.gen'

const byId = (id: CourseId) => ({ path: { id } })

export const courseOptions = (id: CourseId) => getCourseOptions(byId(id))
export const curriculumOptions = (id: CourseId) => getCurriculumOptions(byId(id))
export const learnerStateOptions = (id: CourseId) => learnerCourseStateOptions(byId(id))
export const contributorsOptions = (id: CourseId) => listContributorsOptions(byId(id))
export const updatesOptions = (id: CourseId) => listCourseUpdatesOptions(byId(id))

// Enrolment answers a Trail, not the learner state: the state (and "my courses") are read again.
const enrolment = (id: CourseId) => ({ invalidates: [learnerCourseStateQueryKey(byId(id)), getTrailQueryKey()] })
export const enrollOptions = (id: CourseId) => ({ ...addCourseMutation(), meta: enrolment(id) })
export const leaveOptions = (id: CourseId) => ({ ...removeCourseMutation(), meta: enrolment(id) })

// The roster in the cache takes the answer: the caller's own row is added on apply and dropped on withdraw.
const setRoster = (queryClient: QueryClient, id: CourseId, change: (rows: Contributor[]) => Contributor[]) =>
  queryClient.setQueryData(contributorsOptions(id).queryKey, rows => rows && change(rows))

export const applyOptions = (queryClient: QueryClient, id: CourseId) => ({
  ...applyContributorMutation(),
  onSuccess: (row: Contributor) => setRoster(queryClient, id, rows => [...rows, row]),
})

export const withdrawOptions = (queryClient: QueryClient, id: CourseId, userId: UserId) => ({
  ...removeContributorMutation(),
  onSuccess: () => setRoster(queryClient, id, rows => rows.filter(row => row.user_id !== userId)),
})

/**
 * The course page's layout loader: the course (an unknown, malformed or hidden id is "not found", UX-078), its
 * roster for the authors line, and for a signed-in user the learner state (a guest has none: the API answers 401).
 */
export async function ensureCoursePage(queryClient: QueryClient, id: CourseId, session: SessionInfo | null) {
  const [course] = await Promise.all([
    queryClient.ensureQueryData(courseOptions(id)),
    queryClient.ensureQueryData(contributorsOptions(id)),
    session ? queryClient.ensureQueryData(learnerStateOptions(id)) : null,
  ]).catch((error: unknown) => {
    if (error instanceof ApiError && (error.status === 404 || error.status === 422)) throw notFound()
    throw error
  })
  return course
}
