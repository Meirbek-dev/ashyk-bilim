'use client'

import { MutationCache, QueryCache, QueryClient, environmentManager } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { Query } from '@tanstack/react-query'
import { recoverBrowserSessionFrom401 } from '@/lib/api-client'

const FIVE_MINUTES = 5 * 60 * 1000

function handle401(error: unknown): void {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as Record<string, unknown>).status)
      : undefined
  if (status !== 401 || environmentManager.isServer()) return
  const { pathname, search } = globalThis.location
  void recoverBrowserSessionFrom401(`${pathname}${search}`).catch(() => undefined)
}

function shouldRetry(failureCount: number, error: unknown) {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as Record<string, unknown>).status)
      : undefined

  if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
    return false
  }

  return failureCount < 3
}

function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: handle401 }),
    mutationCache: new MutationCache({ onError: handle401 }),
    defaultOptions: {
      queries: {
        gcTime: FIVE_MINUTES,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        retry: shouldRetry,
        retryDelay: 5000,
        staleTime: 60_000,
      },
      mutations: {
        retry: 0,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

export function getQueryClient() {
  if (environmentManager.isServer()) {
    return makeQueryClient()
  }

  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}

/**
 * SessionStorage persister for the query cache.
 * Uses sessionStorage so data is cleared when the browser tab closes,
 * avoiding stale data across different user sessions on shared devices.
 * Only created in the browser — returns null on the server.
 */
export function createQueryPersister() {
  if (typeof globalThis.window === 'undefined') return null
  return createAsyncStoragePersister({
    storage: globalThis.sessionStorage,
    key: 'tanstack-query-cache',
  })
}

export function shouldPersistQuery(query: Query) {
  return query.meta?.persist === true && query.state.status === 'success'
}
