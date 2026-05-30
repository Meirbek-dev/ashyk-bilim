import 'server-only'
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { connection } from 'next/server'
import { redirect as nextRedirect, unstable_rethrow } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { redirect as localeRedirect } from '@/i18n/navigation'
import { apiFetch } from '@/lib/api-client'
import { isAccessTokenExpired } from './cookie-bridge'
import { ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME } from './types'
import type { Session, UserSessionResponse } from './types'

async function getPageReturnTo(): Promise<string | null> {
  const headersList = await headers()
  const pathname = headersList.get('x-pathname')
  if (!pathname) return null
  return `${pathname}${headersList.get('x-search') ?? ''}`
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Get the current session from the backend.
 *
 * The result is deduplicated within a single RSC render tree via React.cache().
 * A fresh auth check still happens on every incoming request.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  try {
    await connection()
    const [cookieStore, pageReturnTo] = await Promise.all([cookies(), getPageReturnTo()])
    const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value
    const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE_NAME)?.value

    if (!accessToken) {
      if (refreshToken && pageReturnTo) {
        nextRedirect(`/api/auth/refresh?returnTo=${encodeURIComponent(pageReturnTo)}`)
      }
      return null
    }

    if (isAccessTokenExpired(accessToken)) {
      if (pageReturnTo) {
        nextRedirect(`/api/auth/refresh?returnTo=${encodeURIComponent(pageReturnTo)}`)
      }
      return null
    }

    const res = await apiFetch('auth/me')
    if (!res.ok) {
      return null
    }

    const sessionData = (await res.json()) as UserSessionResponse
    return {
      ...sessionData,
      expiresAt: sessionData.expires_at ?? 0,
      sessionVersion: sessionData.session_version ?? null,
    }
  } catch (error) {
    unstable_rethrow(error)

    const message = error instanceof Error ? error.message : String(error)
    console.warn('[getSession] Failed to fetch session from backend:', message)
    return null
  }
})

/**
 * Require an authenticated session or redirect to /login.
 *
 * The returnTo path comes from the x-pathname header injected by proxy.ts,
 * so the user lands back at their intended destination after signing in.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) {
    const headersList = await headers()
    const locale = await getLocale()
    const returnTo = headersList.get('x-pathname') ?? '/'
    return localeRedirect({
      href: `/login?returnTo=${encodeURIComponent(returnTo)}`,
      locale,
    })
  }
  return session
}
