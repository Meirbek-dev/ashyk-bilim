import { infiniteQueryOptions, type InfiniteData } from '@tanstack/react-query'

import type { ApiError } from '#/shared/api/errors'
import { listCollectionsInfiniteQueryKey } from '#/shared/api/gen/@tanstack/react-query.gen'
import { listCollections } from '#/shared/api/gen/sdk.gen'
import type { CollectionId, CollectionPage } from '#/shared/api/gen/types.gen'

const PAGE_SIZE = 20

/** Keyset paging: the next request carries the previous page's opaque `next_cursor`. */
export const nextCollectionsCursor = (page: CollectionPage) => page.next_cursor ?? undefined

// Composed by hand: the generated listCollectionsInfiniteOptions types its queryFn as skippable,
// which useSuspenseInfiniteQuery rejects. Key and request still come from the generated client.
export const collectionsListOptions = () => {
  const options = { query: { limit: PAGE_SIZE } }
  return infiniteQueryOptions<
    CollectionPage,
    ApiError,
    InfiniteData<CollectionPage>,
    ReturnType<typeof listCollectionsInfiniteQueryKey>,
    CollectionId | undefined
  >({
    queryKey: listCollectionsInfiniteQueryKey(options),
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await listCollections({
        query: { ...options.query, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
        throwOnError: true,
      })
      return data
    },
    initialPageParam: undefined,
    getNextPageParam: nextCollectionsCursor,
  })
}
