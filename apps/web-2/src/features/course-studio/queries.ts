import { infiniteQueryOptions, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

import { contributorsOptions, setUpdates, updatesOptions } from '#/features/course'
import { ApiError } from '#/shared/api/errors'
import {
  courseArchivePreviewOptions,
  courseLifecycleMutation,
  courseReadinessOptions,
  courseReadinessQueryKey,
  createCertificationMutation,
  createCourseMutation,
  createCourseUpdateMutation,
  deleteCertificationMutation,
  deleteCourseMutation,
  deleteCourseUpdateMutation,
  duplicateCourseMutation,
  editCourseUpdateMutation,
  getCourseOptions,
  getCourseQueryKey,
  listCourseCertificationsOptions,
  listCoursesInfiniteQueryKey,
  listCoursesOptions,
  listGroupsOptions,
  updateCertificationMutation,
  updateCourseMutation,
  groupsForCourseOptions,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import { addGroupCourses, listCourses, removeGroupCourses } from '#/shared/api/gen/sdk.gen'
import type {
  Certification,
  Course,
  CourseId,
  CoursePage,
  CourseUpdate,
  Usergroup,
  UsergroupPage,
} from '#/shared/api/gen/types.gen'

import { can, opensWorkspace, type CoursesSearch } from './model/course'

const PAGE_SIZE = 20
const byId = (id: CourseId) => ({ path: { course_id: id } })

/** The caller's editable courses (`mine=true` adds `summary`), keyset paged; `preset` and `q` are server filters. */
export const myCoursesOptions = (search: CoursesSearch) => {
  const query = { mine: true, limit: PAGE_SIZE, ...search }
  return infiniteQueryOptions<
    CoursePage,
    ApiError,
    InfiniteData<CoursePage>,
    ReturnType<typeof listCoursesInfiniteQueryKey>,
    CourseId | undefined
  >({
    queryKey: listCoursesInfiniteQueryKey({ query }),
    queryFn: async ({ pageParam, signal }) => {
      const cursor = pageParam ? { cursor: pageParam } : {}
      const { data } = await listCourses({ query: { ...query, ...cursor }, signal, throwOnError: true })
      return data
    },
    initialPageParam: undefined,
    getNextPageParam: page => page.next_cursor ?? undefined,
  })
}

// Every list variant (catalog, mine, any filter or cursor) is a prefix match of the bare key.
const lists = () => listCoursesInfiniteQueryKey()

export const courseOptions = (id: CourseId) => getCourseOptions(byId(id))
export const readinessOptions = (id: CourseId) => courseReadinessOptions(byId(id))
export const archivePreviewOptions = (id: CourseId) => courseArchivePreviewOptions(byId(id))
export const courseGroupsOptions = (id: CourseId) => groupsForCourseOptions(byId(id))
export const certificationsOptions = (id: CourseId) => listCourseCertificationsOptions(byId(id))
export { contributorsOptions, updatesOptions }

/**
 * Loader of every workspace tab: the course, read once for the layout. An unknown or malformed id is "not found";
 * a course the caller may neither edit nor restore is a 403 shown in place (spec 5.2).
 */
export async function ensureWorkspace(queryClient: QueryClient, id: CourseId) {
  const course = await queryClient.ensureQueryData(courseOptions(id)).catch((error: unknown) => {
    if (error instanceof ApiError && (error.status === 404 || error.status === 422)) throw notFound()
    throw error
  })
  if (!opensWorkspace(course)) {
    throw new ApiError({ status: 403, code: 'forbidden', fieldErrors: [], requestId: null, retryAfter: null })
  }
  return course
}

/** Loader of `settings`: the certificate configuration, and the archive preview when the course can be archived. */
export async function ensureCourseSettings(queryClient: QueryClient, id: CourseId) {
  const course = await queryClient.ensureQueryData(courseOptions(id))
  await Promise.all([
    queryClient.ensureQueryData(certificationsOptions(id)),
    can(course, 'archive') ? queryClient.ensureQueryData(archivePreviewOptions(id)) : null,
  ])
}

// ---- Course ----

// "Reload and retry" after a 412 (`useIfMatch`): the object's current `version`, read again into the cache. A row
// gone meanwhile keeps its old version: the write then answers 404.
export const courseVersion = async (queryClient: QueryClient, id: CourseId) =>
  (await queryClient.fetchQuery({ ...courseOptions(id), staleTime: 0 })).version

const putCourse = (queryClient: QueryClient) => (course: Course) =>
  queryClient.setQueryData(getCourseQueryKey(byId(course.id)), course)

export const createCourseOptions = () => ({ ...createCourseMutation(), meta: { invalidates: [lists()] } })

// ponytail: the 100 most recently changed editable courses; a searchable picker when authors outgrow it.
/** Courses a new one may be copied from: the caller's editable ones (the copy needs write access to the source). */
export const copySourcesOptions = () => listCoursesOptions({ query: { mine: true, limit: 100 } })

/** A copy of a course (chapters, activities, assessments as drafts; no learners); retried with one `Idempotency-Key`. */
export const duplicateCourseOptions = () => ({ ...duplicateCourseMutation(), meta: { invalidates: [lists()] } })

// The answer is the course: it replaces the cached one; readiness (thumbnail) is read again where shown.
export const updateCourseOptions = (queryClient: QueryClient, id: CourseId) => ({
  ...updateCourseMutation(),
  onSuccess: putCourse(queryClient),
  meta: { invalidates: [lists(), courseReadinessQueryKey(byId(id))] },
})

export const lifecycleOptions = (queryClient: QueryClient, id: CourseId) => ({
  ...courseLifecycleMutation(),
  onSuccess: putCourse(queryClient),
  meta: { invalidates: [lists(), courseReadinessQueryKey(byId(id))] },
})

// ---- Groups (cohort access): link answers 204, the course's group list takes the change. ----

// ponytail: the first 100 groups only (the API's page cap); a searchable picker when platforms outgrow it.
/** Groups the caller may link courses to. */
export const linkableGroupsOptions = () => ({
  ...listGroupsOptions({ query: { limit: 100 } }),
  select: (page: UsergroupPage) => page.items.filter(group => group.allowed_actions.includes('manage_courses')),
})

const setGroups = (queryClient: QueryClient, id: CourseId, change: (groups: Usergroup[]) => Usergroup[]) =>
  queryClient.setQueryData(courseGroupsOptions(id).queryKey, groups => groups && change(groups))

export const linkGroupsOptions = (queryClient: QueryClient, id: CourseId) => ({
  mutationFn: (groups: Usergroup[]) =>
    Promise.all(
      groups.map(group =>
        addGroupCourses({ path: { group_id: group.id }, body: { course_ids: [id] }, throwOnError: true }),
      ),
    ),
  onSuccess: (_: unknown, linked: Usergroup[]) =>
    setGroups(queryClient, id, groups => [
      ...groups,
      ...linked.filter(group => !groups.some(old => old.id === group.id)),
    ]),
})

export const unlinkGroupOptions = (queryClient: QueryClient, id: CourseId) => ({
  mutationFn: (group: Usergroup) =>
    removeGroupCourses({ path: { group_id: group.id }, body: { course_ids: [id] }, throwOnError: true }),
  onSuccess: (_: unknown, gone: Usergroup) =>
    setGroups(queryClient, id, groups => groups.filter(g => g.id !== gone.id)),
})

/**
 * Delete the course and everything under it (cascades: progress, attempts, grades, certificates). The lists are read
 * again; its own cached course is left alone (the page navigates to the list, nothing reads it again).
 */
export const deleteCourseOptions = () => ({ ...deleteCourseMutation(), meta: { invalidates: [lists()] } })

// ---- Announcements: the cached list takes each answer (newest first). ----

export const createUpdateOptions = (queryClient: QueryClient, id: CourseId) => ({
  ...createCourseUpdateMutation(),
  onSuccess: (row: CourseUpdate) => setUpdates(queryClient, id, rows => [row, ...rows], 'first'),
})

// Every loaded page is read again; a row gone meanwhile keeps its old version (the write then answers 404).
export const updateVersion = async (queryClient: QueryClient, id: CourseId, update: CourseUpdate) =>
  (await queryClient.fetchInfiniteQuery({ ...updatesOptions(id), staleTime: 0 })).pages
    .flatMap(page => page.items)
    .find(row => row.id === update.id)?.version ?? update.version

export const editUpdateOptions = (queryClient: QueryClient, id: CourseId) => ({
  ...editCourseUpdateMutation(),
  onSuccess: (row: CourseUpdate) =>
    setUpdates(queryClient, id, rows => rows.map(old => (old.id === row.id ? row : old))),
})

export const deleteUpdateOptions = (queryClient: QueryClient, id: CourseId) => ({
  ...deleteCourseUpdateMutation(),
  onSuccess: (_: unknown, { path }: { path: { update_id: string } }) =>
    setUpdates(queryClient, id, rows => rows.filter(row => row.id !== path.update_id)),
})

// ---- Certificate: at most one configuration per course; readiness warns without one. ----

const setCertifications = (queryClient: QueryClient, id: CourseId, rows: Certification[]) =>
  queryClient.setQueryData(certificationsOptions(id).queryKey, rows)

const certificateMeta = (id: CourseId) => ({ invalidates: [courseReadinessQueryKey(byId(id))] })

export const createCertificationOptions = (queryClient: QueryClient, id: CourseId) => ({
  ...createCertificationMutation(),
  onSuccess: (row: Certification) => setCertifications(queryClient, id, [row]),
  meta: certificateMeta(id),
})

export const certificationVersion = async (queryClient: QueryClient, id: CourseId, row: Certification) =>
  (await queryClient.fetchQuery({ ...certificationsOptions(id), staleTime: 0 })).find(old => old.id === row.id)
    ?.version ?? row.version

export const updateCertificationOptions = (queryClient: QueryClient, id: CourseId) => ({
  ...updateCertificationMutation(),
  onSuccess: (row: Certification) => setCertifications(queryClient, id, [row]),
})

export const deleteCertificationOptions = (queryClient: QueryClient, id: CourseId) => ({
  ...deleteCertificationMutation(),
  onSuccess: () => setCertifications(queryClient, id, []),
  meta: certificateMeta(id),
})
