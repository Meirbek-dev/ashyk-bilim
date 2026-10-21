import { infiniteQueryOptions, type InfiniteData, type QueryClient } from '@tanstack/react-query'

import type { ApiError } from '#/shared/api/errors'
import { listCoursesOptions, workQueueInfiniteQueryKey } from '#/shared/api/gen/@tanstack/react-query.gen'
import { workQueue } from '#/shared/api/gen/sdk.gen'
import type { WorkQueue, WorkQueueData, WorkRole } from '#/shared/api/gen/types.gen'

import { type InboxSearch, nextWorkCursor, workQuery } from './model/inbox'

/** The server maximum. */
const PAGE_SIZE = 100

type WorkFilter = Omit<NonNullable<WorkQueueData['query']>, 'role' | 'limit' | 'cursor'>

// Composed by hand like collections: the generated infinite options type queryFn as skippable, which
// useSuspenseInfiniteQuery rejects. Key and request still come from the generated client.
const workOptions = (role: WorkRole, filter: WorkFilter = {}) => {
  const options = { query: { role, limit: PAGE_SIZE, ...filter } }
  return infiniteQueryOptions<
    WorkQueue,
    ApiError,
    InfiniteData<WorkQueue>,
    ReturnType<typeof workQueueInfiniteQueryKey>,
    string | undefined
  >({
    queryKey: workQueueInfiniteQueryKey(options),
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await workQueue({
        query: { ...options.query, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
        throwOnError: true,
      })
      return data
    },
    initialPageParam: undefined,
    getNextPageParam: nextWorkCursor,
  })
}

/** /teach: submissions to grade or release in the caller's courses, filtered and ordered by the server. */
export const teachWorkOptions = (search: InboxSearch = {}) => workOptions('teacher', workQuery(search))

/** The caller's own open work (returned, waiting, released, overdue, in progress): for /home, slice 3.1. */
export const learnerWorkOptions = () => workOptions('learner')

/** Whether the teacher has any course at all: the `summary` of their courses (one row is enough). */
export const ownCoursesOptions = () => listCoursesOptions({ query: { mine: true, limit: 1 } })

/**
 * Route loader of /teach: the queue, and when it is empty and unfiltered, whether the teacher has a course yet - a
 * brand-new teacher is told to create one instead of «Всё проверено» (B-INB-11).
 */
export async function ensureInbox(queryClient: QueryClient, search: InboxSearch) {
  const work = await queryClient.infiniteQuery({ ...teachWorkOptions(search), staleTime: 'static' })
  const filtered = Boolean(search.kind ?? search.course)
  if (!filtered && (work.pages[0]?.items.length ?? 0) === 0)
    // Fresh each time: a course made since the last visit must end the «first course» state.
    await queryClient.query({ ...ownCoursesOptions(), staleTime: 0 })
}
