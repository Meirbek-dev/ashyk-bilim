import 'server-only'
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { connection } from 'next/server'
import { unstable_rethrow } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { redirect as localeRedirect } from '@/i18n/navigation'
import { apiJson } from '@/lib/api-client'
import { isApiError } from '@/lib/api/assertSuccess'
import { SessionInfo, UserProfile } from '@/lib/api/generated/zod'
import { buildReturnTo } from './return-to'
import { SESSION_COOKIE_NAME } from './types'
import type { Session } from './types'

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Get the current session from the backend.
 *
 * `GET /auth/session` is the cheap "am I logged in?" probe (user id, roles,
 * permission strings); the profile comes from `GET /users/me`. The result is
 * deduplicated within a single RSC render tree via React.cache(); a fresh
 * check still happens on every incoming request. Without the session cookie
 * no request is made at all.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  try {
    await connection()
    const cookieStore = await cookies()
    if (!cookieStore.get(SESSION_COOKIE_NAME)?.value) {
      return null
    }

    const [info, user] = await Promise.all([
      apiJson('auth/session', {}, data => SessionInfo.parse(data)),
      apiJson('users/me', {}, data => UserProfile.parse(data)),
    ])

    return {
      user,
      userId: info.user_id,
      roles: info.roles,
      permissions: info.permissions,
    }
  } catch (error) {
    unstable_rethrow(error)

    if (isApiError(error) && error.status === 401) {
      return null
    }

    const message = error instanceof Error ? error.message : String(error)
    console.warn('[getSession] Failed to fetch session from backend:', message)
    return null
  }
})

/**
 * Require an authenticated session or redirect to /login.
 *
 * The returnTo path comes from request headers injected by proxy.ts,
 * so the user lands back at their intended destination after signing in.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) {
    const [headersList, locale] = await Promise.all([headers(), getLocale()])
    const returnTo = buildReturnTo(headersList.get('x-pathname'), headersList.get('x-search'))
    return localeRedirect({
      href: `/login?returnTo=${encodeURIComponent(returnTo)}`,
      locale,
    })
  }
  return session
}
