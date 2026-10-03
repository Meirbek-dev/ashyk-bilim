import { infiniteQueryOptions, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

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
  deleteCourseUpdateMutation,
  editCourseUpdateMutation,
  getCourseOptions,
  getCourseQueryKey,
  listContributorsOptions,
  listCourseCertificationsOptions,
  listCourseUpdatesOptions,
  listCoursesInfiniteQueryKey,
  listUsergroupsOptions,
  removeContributorMutation,
  updateCertificationMutation,
  updateContributorMutation,
  updateCourseMutation,
  usergroupsForCourseOptions,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import { addContributor, addUsergroupCourses, listCourses, removeUsergroupCourses } from '#/shared/api/gen/sdk.gen'
import type {
  Certification,
  Contributor,
  ContributorRole,
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
export const contributorsOptions = (id: CourseId) => listContributorsOptions(byId(id))
export const courseGroupsOptions = (id: CourseId) => usergroupsForCourseOptions(byId(id))
export const updatesOptions = (id: CourseId) => listCourseUpdatesOptions(byId(id))
export const certificationsOptions = (id: CourseId) => listCourseCertificationsOptions(byId(id))

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
  ...listUsergroupsOptions({ query: { limit: 100 } }),
  select: (page: UsergroupPage) => page.items.filter(group => group.allowed_actions.includes('manage_courses')),
})

const setGroups = (queryClient: QueryClient, id: CourseId, change: (groups: Usergroup[]) => Usergroup[]) =>
  queryClient.setQueryData(courseGroupsOptions(id).queryKey, groups => groups && change(groups))

export const linkGroupsOptions = (queryClient: QueryClient, id: CourseId) => ({
  mutationFn: (groups: Usergroup[]) =>
    Promise.all(
      groups.map(group =>
        addUsergroupCourses({ path: { usergroup_id: group.id }, body: { course_ids: [id] }, throwOnError: true }),
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
    removeUsergroupCourses({ path: { usergroup_id: group.id }, body: { course_ids: [id] }, throwOnError: true }),
  onSuccess: (_: unknown, gone: Usergroup) =>
    setGroups(queryClient, id, groups => groups.filter(g => g.id !== gone.id)),
})

// ---- Team ----

const setRoster = (queryClient: QueryClient, id: CourseId, change: (rows: Contributor[]) => Contributor[]) =>
  queryClient.setQueryData(contributorsOptions(id).queryKey, rows => rows && change(rows))

const putRow = (row: Contributor) => (rows: Contributor[]) =>
  rows.some(old => old.user_id === row.user_id)
    ? rows.map(old => (old.user_id === row.user_id ? row : old))
    : [...rows, row]

/** Several people at once, one request each; every answered row joins the roster. */
export const addContributorsOptions = (queryClient: QueryClient, id: CourseId) => ({
  mutationFn: ({ userIds, role }: { userIds: string[]; role: ContributorRole }) =>
    Promise.all(
      userIds.map(async userId => {
        const { data } = await addContributor({
          path: { course_id: id },
          body: { user_id: userId, role },
          throwOnError: true,
        })
        return data
      }),
    ),
  onSuccess: (rows: Contributor[]) =>
    setRoster(queryClient, id, list => rows.reduce((acc, row) => putRow(row)(acc), list)),
})

export const updateContributorOptions = (queryClient: QueryClient, id: CourseId) => ({
  ...updateContributorMutation(),
  onSuccess: (row: Contributor) => setRoster(queryClient, id, putRow(row)),
})

export const removeContributorOptions = (queryClient: QueryClient, id: CourseId) => ({
  ...removeContributorMutation(),
  onSuccess: (_: unknown, { path }: { path: { user_id: string } }) =>
    setRoster(queryClient, id, rows => rows.filter(row => row.user_id !== path.user_id)),
})

// ---- Announcements: the list takes each answer (newest first). ----

const setUpdates = (queryClient: QueryClient, id: CourseId, change: (rows: CourseUpdate[]) => CourseUpdate[]) =>
  queryClient.setQueryData(updatesOptions(id).queryKey, rows => rows && change(rows))

export const createUpdateOptions = (queryClient: QueryClient, id: CourseId) => ({
  ...createCourseUpdateMutation(),
  onSuccess: (row: CourseUpdate) => setUpdates(queryClient, id, rows => [row, ...rows]),
})

export const updateVersion = async (queryClient: QueryClient, id: CourseId, update: CourseUpdate) =>
  (await queryClient.fetchQuery({ ...updatesOptions(id), staleTime: 0 })).find(row => row.id === update.id)?.version ??
  update.version

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
