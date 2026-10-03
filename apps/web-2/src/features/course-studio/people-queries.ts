import { infiniteQueryOptions, type InfiniteData, type QueryClient } from '@tanstack/react-query'

import { setRoster } from '#/features/course'
import type { ApiError } from '#/shared/api/errors'
import {
  courseArchivePreviewQueryKey,
  listCourseLearnersInfiniteQueryKey,
  listCourseLearnersQueryKey,
  removeContributorMutation,
  removeCourseLearnerMutation,
  updateContributorMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import { addContributor, listCourseLearners } from '#/shared/api/gen/sdk.gen'
import type {
  Contributor,
  ContributorRole,
  CourseId,
  CourseLearner,
  CourseLearnerPage,
} from '#/shared/api/gen/types.gen'

// The people of a course: its learners (`learners` tab) and its team (`team` tab). The roster itself and its cache
// writes are the course page's (`#/features/course`).

const PAGE_SIZE = 20
const byId = (id: CourseId) => ({ path: { course_id: id } })

/** The course's learners, newest first, keyset paged (roster managers). */
export const learnersOptions = (id: CourseId) => {
  const query = { limit: PAGE_SIZE }
  return infiniteQueryOptions<
    CourseLearnerPage,
    ApiError,
    CourseLearner[],
    ReturnType<typeof listCourseLearnersInfiniteQueryKey>,
    string | undefined
  >({
    queryKey: listCourseLearnersInfiniteQueryKey({ ...byId(id), query }),
    queryFn: async ({ pageParam, signal }) => {
      const cursor = pageParam ? { cursor: pageParam } : {}
      const { data } = await listCourseLearners({
        ...byId(id),
        query: { ...query, ...cursor },
        signal,
        throwOnError: true,
      })
      return data
    },
    initialPageParam: undefined,
    getNextPageParam: page => page.next_cursor ?? undefined,
    select: (data: InfiniteData<CourseLearnerPage>) => data.pages.flatMap(page => page.items),
  })
}

// ---- Learners: the removed one leaves every cached learners list of the course; the archive counts are stale. ----

const dropLearner = (userId: string) => (page: CourseLearnerPage) => ({
  ...page,
  items: page.items.filter(learner => learner.user_id !== userId),
})

export const removeLearnerOptions = (queryClient: QueryClient, id: CourseId) => ({
  ...removeCourseLearnerMutation(),
  // The key matches this tab's pages (infinite) and the plain page other screens read: both shapes take the change.
  onSuccess: (_: unknown, { path }: { path: { user_id: string } }) => {
    const drop = dropLearner(path.user_id)
    queryClient.setQueriesData<CourseLearnerPage | InfiniteData<CourseLearnerPage>>(
      { queryKey: listCourseLearnersQueryKey(byId(id)) },
      data => data && ('pages' in data ? { ...data, pages: data.pages.map(drop) } : drop(data)),
    )
  },
  meta: { invalidates: [courseArchivePreviewQueryKey(byId(id))] },
})

// ---- Team: the cached roster takes each answer. ----

/** Several people at once, one request each; every answered row joins the roster (a known one is replaced). */
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
  onSuccess: (added: Contributor[]) => {
    setRoster(queryClient, id, rows => rows.filter(old => !added.some(row => row.user_id === old.user_id)))
    setRoster(queryClient, id, rows => [...rows, ...added], 'last')
  },
})

export const updateContributorOptions = (queryClient: QueryClient, id: CourseId) => ({
  ...updateContributorMutation(),
  onSuccess: (row: Contributor) =>
    setRoster(queryClient, id, rows => rows.map(old => (old.user_id === row.user_id ? row : old))),
})

export const removeContributorOptions = (queryClient: QueryClient, id: CourseId) => ({
  ...removeContributorMutation(),
  onSuccess: (_: unknown, { path }: { path: { user_id: string } }) =>
    setRoster(queryClient, id, rows => rows.filter(row => row.user_id !== path.user_id)),
})
