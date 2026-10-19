import { queryOptions } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'
import * as v from 'valibot'

import { ApiError } from '#/shared/api/errors'
import { noteSessionBack, noteSessionExpired, sessionHeld } from '#/shared/api/held-session'
import type { currentSessionQueryKey } from '#/shared/api/gen/@tanstack/react-query.gen'
import type { SessionInfo } from '#/shared/api/gen/types.gen'
import { KEY_ORIGIN } from '#/shared/api/key-origin'
import { applyProfileLanguage } from '#/shared/i18n/profile-language'
import { storageItem } from '#/shared/lib/storage'

import { safeRedirect } from './redirect'

// The root route reads the session, so this module is in the entry chunk: no runtime import of the generated SDK
// or query options here (each holds every operation the app uses; gate G-05). The key is the generated one,
// spelled out: session.test.ts pins it to currentSessionQueryKey().
const sessionQueryKey = (): ReturnType<typeof currentSessionQueryKey> => [
  { _id: 'currentSession', baseUrl: KEY_ORIGIN },
]

/**
 * Set when a live session ended under the tab (a 401 on a read: expired, signed out elsewhere); the sign-in page says
 * why it is shown and clears it (B-AUTH-16). Per tab, so another tab's fresh visit is not told about it.
 */
export const sessionEnded = storageItem('ab.session-ended', v.literal(true), 'session')

/** The caller's session, or null for a guest. Read by the root route into the router context (spec 7.5). */
export const sessionOptions = () =>
  queryOptions({
    queryKey: sessionQueryKey(),
    queryFn: async ({ signal }): Promise<SessionInfo | null> => {
      try {
        const { currentSession } = await import('#/shared/api/gen/sdk.gen')
        const { data } = await currentSession({ signal, throwOnError: true })
        noteSessionBack()
        return data
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) throw error
        // A held upload keeps the page: the session read keeps its last answer instead of signing out.
        if (!sessionHeld()) return null
        noteSessionExpired()
        throw error
      }
    },
  })

type GuardInput = {
  context: { session: SessionInfo | null }
  location: { href: string; search?: Record<string, unknown> }
}

/** `_authed` beforeLoad: no session -> /login with a return path. */
export function requireSession({ context, location }: GuardInput): { session: SessionInfo } {
  if (!context.session) throw redirect({ to: '/login', search: { redirect: location.href } })
  return { session: context.session }
}

/**
 * `_guest` beforeLoad: a signed-in user has nothing to do on guest pages and goes on to `?redirect` (or /home). This is
 * also where a Google sign-in returns (`/login?redirect=`): the page after it speaks the profile's language.
 */
export function requireGuest({
  context,
  location,
}: {
  context: { session: { user: Pick<SessionInfo['user'], 'language'> } | null }
  location: GuardInput['location']
}): void {
  if (!context.session) return
  applyProfileLanguage(context.session.user.language, location.href)
  const target = location.search?.['redirect']
  throw redirect({ href: safeRedirect(typeof target === 'string' ? target : undefined) })
}
