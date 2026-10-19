import { hashKey, MutationCache, QueryCache, QueryClient, type Query, type QueryKey } from '@tanstack/react-query'

import { sessionEnded, sessionOptions } from '#/shared/auth/session'

import { ApiError, isSessionLost } from './errors'
import { noteSessionExpired, sessionHeld } from './held-session'

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      invalidates?: QueryKey[]
    }
  }
}

export type RouterContext = { queryClient: QueryClient }

/** Lets go of a session hold; the last one while the session is still gone reads it again (a 401 then signs out). */
export function releaseSessionHold(queryClient: QueryClient, release: () => boolean): void {
  if (release()) void queryClient.invalidateQueries({ queryKey: sessionOptions().queryKey })
}

/** One retry for a GET that hit the network or a 5xx; 4xx answers are final. */
const retryOnce = (failureCount: number, error: Error): boolean =>
  failureCount < 1 && !(error instanceof ApiError && error.status < 500)

/**
 * No background refetch (focus, reconnect) while an upload is held, except the session's own: with the session gone a
 * public read answers as a guest and would take away the screen the upload runs on (a course without `update`).
 */
const refetchUnlessHeld = (query: Query): boolean =>
  !sessionHeld() || query.queryHash === hashKey(sessionOptions().queryKey)

/** The sign-in page's «session ended» note (B-AUTH-16): set when a signed-in tab's session went away, cleared by a
 * new one. Storage may refuse (private mode, quota): the note is then just not shown. */
function noteSessionEnded(ended: boolean) {
  try {
    if (ended) sessionEnded.set(true)
    else sessionEnded.remove()
  } catch {
    // no storage: no note
  }
}

/**
 * One QueryClient per request (SSR) or per tab. Owns the two global behaviors of spec 7.5-7.6:
 * mutations invalidate the keys in `meta.invalidates`, and a lost session re-runs the route guards.
 */
export function createQueryClient(onSessionLost: () => Promise<void>): QueryClient {
  // Clearing the session triggers the subscription below, which re-runs the guards. While an upload is held
  // (`held-session.ts`) the page stays: the notice offers a sign-in, and the session is read again on the next focus.
  const loseSession = (error: Error) => {
    if (!isSessionLost(error)) return
    if (!sessionHeld()) {
      queryClient.setQueryData(sessionOptions().queryKey, null)
      return
    }
    noteSessionExpired()
    void queryClient.invalidateQueries({ queryKey: sessionOptions().queryKey, refetchType: 'none' })
  }
  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: retryOnce,
        refetchOnWindowFocus: refetchUnlessHeld,
        refetchOnReconnect: refetchUnlessHeld,
      },
    },
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
  // Only an answer counts (a guest is `null`): a session query without data is not a sign-out. The SSR teardown clears
  // the cache after the response (a guard re-run there loads every route again outside the request), and garbage
  // collection drops an unobserved one.
  const sessionKey = sessionOptions().queryKey
  let user: string | null = null
  queryClient.getQueryCache().subscribe(() => {
    const session = queryClient.getQueryData(sessionKey)
    if (session === undefined) return
    const now = session?.user_id ?? null
    if (now === user) return
    const previous = user
    user = now
    noteSessionEnded(previous !== null && now === null)
    if (previous === null) return
    if (now !== null) queryClient.removeQueries({ predicate: query => query.queryHash !== hashKey(sessionKey) })
    void onSessionLost()
  })
  return queryClient
}
