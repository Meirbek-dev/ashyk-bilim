import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { GoogleStartData } from '#/shared/api/gen/types.gen'
import { vErrorCode } from '#/shared/api/gen/valibot.gen'
import { safeRedirect } from '#/shared/auth/redirect'
import { presentError } from '#/shared/i18n/errors'

const GOOGLE_START: GoogleStartData['url'] = '/api/v2/auth/google'

/**
 * googleStart() is a browser navigation (a 303 to Google's consent screen), not a fetch: the button is a link to
 * its URL. After sign-in the server sends the browser back to /login, which applies the profile's language and goes
 * on to `callback` (shared/auth/session.ts `requireGuest`).
 */
export const googleStartHref = (callback: string): string =>
  `${GOOGLE_START}?callback=${encodeURIComponent(`/login?redirect=${encodeURIComponent(safeRedirect(callback))}`)}`

/** Whole minutes to wait after a 429, from `Retry-After` seconds; null when the server gave no time. */
export const retryMinutes = (retryAfterSeconds: number | null): number | null =>
  retryAfterSeconds === null ? null : Math.max(1, Math.ceil(retryAfterSeconds / 60))

/** Public pages a guest can be sent to sign in from; «Назад» goes back there instead of the landing (B-AUTH-17). */
const PUBLIC_PAGE = /^\/(courses|collections|users|certificates|search)(\/|\?|$)/

/** Where «Назад» on sign-in / sign-up leads: the public page the guest came from (without `enroll`), else the landing. */
export function guestBack(redirect: string | undefined): string {
  const target = safeRedirect(redirect)
  if (!PUBLIC_PAGE.test(target)) return '/'
  const url = new URL(target, 'http://internal.invalid')
  url.searchParams.delete('enroll')
  return url.pathname + url.search + url.hash
}

/** The guest pressed «Записаться» on a course: signing in (or up) enrols them at once (B-CRS-16, B-AUTH-17). */
export const enrolsAfterAuth = (redirect: string | undefined): boolean =>
  new URL(safeRedirect(redirect), 'http://internal.invalid').searchParams.get('enroll') === '1'

/**
 * A failed Google sign-in comes back as /login?error=<code>: a contract code, or the callback's own "cancelled". A
 * refused form (`validation-failed`) has no fields to point at here: it reads as the sign-in that did not work.
 */
export function googleErrorText(code: string): string {
  if (!v.is(vErrorCode, code)) return m.auth_login_error_google_cancelled()
  if (code === 'validation-failed') return m.auth_login_error_google_failed()
  return presentError(new ApiError({ status: 400, code, fieldErrors: [], requestId: null, retryAfter: null }))
}
