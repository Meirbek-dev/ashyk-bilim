import { infiniteQueryOptions, type InfiniteData } from '@tanstack/react-query'

import type { ApiError } from '#/shared/api/errors'
import { workQueueInfiniteQueryKey } from '#/shared/api/gen/@tanstack/react-query.gen'
import { workQueue } from '#/shared/api/gen/sdk.gen'
import type { WorkQueue, WorkRole } from '#/shared/api/gen/types.gen'

import { nextWorkCursor } from './model/inbox'

/** The server maximum: the inbox filters narrow loaded pages (see model), so each page carries as much as it can. */
const PAGE_SIZE = 100

// Composed by hand like collections: the generated infinite options type queryFn as skippable, which
// useSuspenseInfiniteQuery rejects. Key and request still come from the generated client.
const workOptions = (role: WorkRole) => {
  const options = { query: { role, limit: PAGE_SIZE } }
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

/** /teach: submissions to grade or release in the caller's courses. */
export const teachWorkOptions = () => workOptions('teacher')

/** The caller's own open work (returned, waiting, released, overdue, in progress): for /home, slice 3.1. */
export const learnerWorkOptions = () => workOptions('learner')
