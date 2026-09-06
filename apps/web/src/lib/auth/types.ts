import type { SessionInfo, UserProfile } from '@/lib/api/generated/zod'

/**
 * The signed-in user as the app sees it: the v2 `UserProfile`
 * (`GET /users/me`). v2 has no first/middle/last name split, no server-side
 * theme and no numeric ids — `id` is the UUID everywhere.
 */
export type SessionUser = UserProfile

/**
 * Frontend session shape: the BFF session (`GET /auth/session` — user id,
 * role slugs, expanded permission strings) joined with the profile.
 */
export interface Session {
  user: SessionUser
  userId: SessionInfo['user_id']
  /** Role slugs (`admin`, `instructor`, …). */
  roles: string[]
  /** Expanded `resource:action:scope` strings; `*` is the admin wildcard. */
  permissions: string[]
}

// ── Cookie constants ───────────────────────────────────────────────────────────

/** The single BFF session cookie (httponly, host-only, SameSite=Lax). */
export const SESSION_COOKIE_NAME = 'ab_session'

export const AUTH_COOKIE_NAMES = [SESSION_COOKIE_NAME] as const

export const AUTH_PERMISSION_WILDCARD = '*'
