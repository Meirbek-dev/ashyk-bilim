import { infiniteQueryOptions, type InfiniteData } from '@tanstack/react-query'

import type { ApiError } from '#/shared/api/errors'
import { workQueueInfiniteQueryKey } from '#/shared/api/gen/@tanstack/react-query.gen'
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
