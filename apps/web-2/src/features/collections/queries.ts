import { infiniteQueryOptions, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

import { ApiError } from '#/shared/api/errors'
import {
  createCollectionMutation,
  deleteCollectionMutation,
  getCollectionOptions,
  getCollectionQueryKey,
  listCollectionsInfiniteQueryKey,
  searchOptions,
  updateCollectionMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import { listCollections } from '#/shared/api/gen/sdk.gen'
import type {
  Collection,
  CollectionAction,
  CollectionId,
  CollectionPage,
  SearchResults,
} from '#/shared/api/gen/types.gen'

import { can, SEARCH_LIMIT } from './model/collections'

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

// listCollections has no name filter: a search goes through the platform search and keeps only its collections.
export const collectionsSearchOptions = (q: string) => ({
  ...searchOptions({ query: { q, limit: SEARCH_LIMIT } }),
  select: (results: SearchResults) => results.collections,
})

export const collectionOptions = (id: CollectionId) => getCollectionOptions({ path: { id } })

// Every list variant (any page size, any cursor) is a prefix match of the bare key.
const lists = () => listCollectionsInfiniteQueryKey()

export const createCollectionOptions = () => ({ ...createCollectionMutation(), meta: { invalidates: [lists()] } })

// The answer carries the new `version`: it replaces the cached collection (spec 7.6) instead of a refetch.
export const updateCollectionOptions = (queryClient: QueryClient, id: CollectionId) => ({
  ...updateCollectionMutation(),
  onSuccess: (collection: Collection) => queryClient.setQueryData(getCollectionQueryKey({ path: { id } }), collection),
  meta: { invalidates: [lists()] },
})

// The deleted collection's own query is left alone: refetching it would only answer 404 to a page being left.
export const deleteCollectionOptions = () => ({ ...deleteCollectionMutation(), meta: { invalidates: [lists()] } })

/**
 * Route loader of a collection page: an unknown or malformed id (404, 422) is "not found", and an action the
 * collection does not list in `allowed_actions` is a 403 shown in place (spec 5.2).
 */
export async function ensureCollection(queryClient: QueryClient, id: CollectionId, action?: CollectionAction) {
  const collection = await queryClient.ensureQueryData(collectionOptions(id)).catch((error: unknown) => {
    if (error instanceof ApiError && (error.status === 404 || error.status === 422)) throw notFound()
    throw error
  })
  if (action && !can(collection, action)) {
    throw new ApiError({ status: 403, code: 'forbidden', fieldErrors: [], requestId: null, retryAfter: null })
  }
  return collection
}
