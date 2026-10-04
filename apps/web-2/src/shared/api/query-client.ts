import { hashKey, MutationCache, QueryCache, QueryClient, type QueryKey } from '@tanstack/react-query'

import { sessionOptions } from '#/shared/auth/session'

import { ApiError, isSessionLost } from './errors'

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { invalidates?: QueryKey[] }
  }
}

export type RouterContext = { queryClient: QueryClient }

/** One retry for a GET that hit the network or a 5xx; 4xx answers are final. */
const retryOnce = (failureCount: number, error: Error): boolean =>
  failureCount < 1 && !(error instanceof ApiError && error.status < 500)

/**
 * One QueryClient per request (SSR) or per tab. Owns the two global behaviors of spec 7.5-7.6:
 * mutations invalidate the keys in `meta.invalidates`, and a lost session re-runs the route guards.
 */
export function createQueryClient(onSessionLost: () => Promise<void>): QueryClient {
  // Clearing the session triggers the subscription below, which re-runs the guards.
  const loseSession = (error: Error) => {
    if (isSessionLost(error)) queryClient.setQueryData(sessionOptions().queryKey, null)
  }
  const queryClient: QueryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: retryOnce } },
    queryCache: new QueryCache({ onError: loseSession }),
    mutationCache: new MutationCache({
      onError: loseSession,
      onSuccess: async (_data, _variables, _context, mutation) => {
        const keys = mutation.meta?.invalidates
        if (keys) await Promise.all(keys.map(queryKey => queryClient.invalidateQueries({ queryKey })))
      },
    }),
  })
  // A session that goes away or changes hands (401 anywhere, sign-out, another account signed in from another tab and
  // seen on a focus refetch) re-runs the guards. On a switch to another account nothing of the previous one stays.
  const sessionKey = sessionOptions().queryKey
  let user: string | null = null
  queryClient.getQueryCache().subscribe(() => {
    const now = queryClient.getQueryData(sessionKey)?.user_id ?? null
    if (now === user) return
    const previous = user
    user = now
    if (previous === null) return
    if (now !== null) queryClient.removeQueries({ predicate: query => query.queryHash !== hashKey(sessionKey) })
    void onSessionLost()
  })
  return queryClient
}
