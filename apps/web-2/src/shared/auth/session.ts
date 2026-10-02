import { queryOptions } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'

import { ApiError } from '#/shared/api/errors'
import { currentSessionQueryKey } from '#/shared/api/gen/@tanstack/react-query.gen'
import { currentSession } from '#/shared/api/gen/sdk.gen'
import type { SessionInfo } from '#/shared/api/gen/types.gen'

/** The caller's session, or null for a guest. Read by the root route into the router context (spec 7.5). */
export const sessionOptions = () =>
  queryOptions({
    queryKey: currentSessionQueryKey(),
    queryFn: async ({ signal }): Promise<SessionInfo | null> => {
      try {
        const { data } = await currentSession({ signal, throwOnError: true })
        return data
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
  })

type GuardInput = { context: { session: SessionInfo | null }; location: { href: string } }

/** `_authed` beforeLoad: no session -> /login with a return path. */
export function requireSession({ context, location }: GuardInput): { session: SessionInfo } {
  if (!context.session) throw redirect({ to: '/login', search: { redirect: location.href } })
  return { session: context.session }
}

/** `_guest` beforeLoad: a signed-in user has nothing to do on guest pages. */
export function requireGuest({ context }: GuardInput): void {
  if (context.session) throw redirect({ to: '/home' })
}
