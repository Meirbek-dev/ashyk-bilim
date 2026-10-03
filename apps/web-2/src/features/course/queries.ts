import { infiniteQueryOptions, type InfiniteData, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

import { ApiError } from '#/shared/api/errors'
import {
  enrollMutation,
  applyContributorMutation,
  getCourseOptions,
  getCurriculumOptions,
  listEnrollmentsQueryKey,
  learnerCourseStateOptions,
  listContributorsPageInfiniteQueryKey,
  listCourseUpdatesPageInfiniteQueryKey,
  removeContributorMutation,
  leaveCourseMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import { listContributorsPage, listCourseUpdatesPage } from '#/shared/api/gen/sdk.gen'
import type { Contributor, CourseId, CourseUpdate, SessionInfo, Trail, UserId } from '#/shared/api/gen/types.gen'

const byId = (id: CourseId) => ({ path: { course_id: id } })

export const courseOptions = (id: CourseId) => getCourseOptions(byId(id))
export const curriculumOptions = (id: CourseId) => getCurriculumOptions(byId(id))
export const learnerStateOptions = (id: CourseId) => learnerCourseStateOptions(byId(id))

type Keyset<T> = { items: T[]; next_cursor: string | null }

/**
 * A keyset list read as one array: `data` is every loaded item, `fetchNextPage` asks for the next `next_cursor`.
 * Composed by hand: the generated infinite options type the queryFn as skippable, which useSuspenseInfiniteQuery
 * rejects. Key and request still come from the generated client.
 */
const keysetOptions = <T, K extends QueryKey>(
  queryKey: K,
  fetch: (cursor: { cursor?: string }, signal: AbortSignal) => Promise<Keyset<T>>,
) =>
  infiniteQueryOptions<Keyset<T>, ApiError, T[], K, string | undefined>({
    queryKey,
    queryFn: ({ pageParam, signal }) => fetch(pageParam ? { cursor: pageParam } : {}, signal),
    initialPageParam: undefined,
    getNextPageParam: page => page.next_cursor ?? undefined,
    select: (data: InfiniteData<Keyset<T>>) => data.pages.flatMap(page => page.items),
  })

// ponytail: the authors line and "is my application pending" read the first 100 roster rows; the team tab pages on.
const ROSTER_PAGE = 100
const UPDATES_PAGE = 20

/** The course roster (shared with the course workspace's `team`), keyset paged. */
export const contributorsOptions = (id: CourseId) => {
  const query = { limit: ROSTER_PAGE }
  return keysetOptions(listContributorsPageInfiniteQueryKey({ ...byId(id), query }), async (cursor, signal) => {
    const { data } = await listContributorsPage({
      ...byId(id),
      query: { ...query, ...cursor },
      signal,
      throwOnError: true,
    })
    return data
  })
}

/** The course's announcements, newest first (shared with the workspace's `publish`), keyset paged. */
export const updatesOptions = (id: CourseId) => {
  const query = { limit: UPDATES_PAGE }
  return keysetOptions(listCourseUpdatesPageInfiniteQueryKey({ ...byId(id), query }), async (cursor, signal) => {
    const { data } = await listCourseUpdatesPage({
      ...byId(id),
      query: { ...query, ...cursor },
      signal,
      throwOnError: true,
    })
    return data
  })
}

type Where = 'every' | 'first' | 'last'

// A write answers one row, not a page: the loaded pages take it in place (no second GET of the list).
const patch = <T, P>(data: InfiniteData<Keyset<T>, P> | undefined, change: (rows: T[]) => T[], where: Where) =>
  data && {
    ...data,
    pages: data.pages.map((page, index) =>
      where === 'every' || index === (where === 'first' ? 0 : data.pages.length - 1)
        ? { ...page, items: change(page.items) }
        : page,
    ),
  }

/** Change the cached roster: `every` loaded page (edit, remove), or only the `first` / `last` one (a new row). */
export const setRoster = (
  queryClient: QueryClient,
  id: CourseId,
  change: (rows: Contributor[]) => Contributor[],
  where: Where = 'every',
) => queryClient.setQueryData(contributorsOptions(id).queryKey, data => patch(data, change, where))

/** The same for the cached announcements (newest first: a new one goes to the `first` page). */
export const setUpdates = (
  queryClient: QueryClient,
  id: CourseId,
  change: (rows: CourseUpdate[]) => CourseUpdate[],
  where: Where = 'every',
) => queryClient.setQueryData(updatesOptions(id).queryKey, data => patch(data, change, where))

// Enrolment with `Prefer: return=representation` answers the Trail with the course's `learner_state`: the cache
// takes it; "my courses" is read again.
const withState = { headers: { Prefer: 'return=representation' } }
const enrolment = (queryClient: QueryClient, id: CourseId) => ({
  onSuccess: ({ learner_state: state }: Trail) => {
    if (state) queryClient.setQueryData(learnerStateOptions(id).queryKey, state)
  },
  meta: { invalidates: [listEnrollmentsQueryKey()] },
})
export const enrollOptions = (queryClient: QueryClient, id: CourseId) => ({
  ...enrollMutation(withState),
  ...enrolment(queryClient, id),
})
export const leaveOptions = (queryClient: QueryClient, id: CourseId) => ({
  ...leaveCourseMutation(withState),
  ...enrolment(queryClient, id),
})

// The roster in the cache takes the answer: the caller's own row is added on apply and dropped on withdraw.
export const applyOptions = (queryClient: QueryClient, id: CourseId) => ({
  ...applyContributorMutation(),
  onSuccess: (row: Contributor) => setRoster(queryClient, id, rows => [...rows, row], 'last'),
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
    queryClient.ensureInfiniteQueryData(contributorsOptions(id)),
    session ? queryClient.ensureQueryData(learnerStateOptions(id)) : null,
  ]).catch((error: unknown) => {
    if (error instanceof ApiError && (error.status === 404 || error.status === 422)) throw notFound()
    throw error
  })
  return course
}
