'use client'

import { MutationCache, QueryCache, QueryClient, environmentManager } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { Mutation, Query } from '@tanstack/react-query'
import { recoverBrowserSessionFrom401 } from '@/lib/api-client'
import { isApiError } from '@/lib/api/assertSuccess'
import { reportClientError, serializeClientError } from '@/services/telemetry/client'

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

interface ErrorMeta {
  entityId?: string | number
  entityType?: string
  expectedCodes?: string[]
  feature?: string
  operation?: string
  userFacing?: boolean
}

export function queryErrorMeta(meta: ErrorMeta): ErrorMeta {
  return meta
}

export function mutationErrorMeta(meta: ErrorMeta): ErrorMeta {
  return meta
}

function readErrorMeta(meta: unknown): ErrorMeta {
  return meta && typeof meta === 'object' ? (meta as ErrorMeta) : {}
}

function shouldReportError(error: unknown, meta: ErrorMeta): boolean {
  if (!isApiError(error)) return true
  if (meta.expectedCodes?.includes(error.code)) return false
  if (error.status >= 400 && error.status < 500 && error.status !== 429) return false
  return true
}

function reportQueryError(error: unknown, query: Query<unknown, unknown, unknown>): void {
  const meta = readErrorMeta(query.meta)
  if (!shouldReportError(error, meta)) return
  void reportClientError({
    scope: 'tanstack-query',
    phase: 'query-error',
    queryHash: query.queryHash,
    queryKey: query.queryKey,
    ...meta,
    error: serializeClientError(error),
  }).catch(() => undefined)
}

function reportMutationError(error: unknown, mutation: Mutation<unknown, unknown>): void {
  const meta = readErrorMeta(mutation.options.meta)
  if (!shouldReportError(error, meta)) return
  void reportClientError({
    scope: 'tanstack-query',
    phase: 'mutation-error',
    mutationKey: mutation.options.mutationKey,
    ...meta,
    error: serializeClientError(error),
  }).catch(() => undefined)
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
    queryCache: new QueryCache({
      onError: (error, query) => {
        handle401(error)
        reportQueryError(error, query)
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        handle401(error)
        reportMutationError(error, mutation)
      },
    }),
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
