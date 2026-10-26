// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import { useHydrated } from '@tanstack/react-router'
import { createElement, lazy, Suspense } from 'react'
import * as v from 'valibot'

import { safeRedirect } from '#/shared/auth/redirect'

/**
 * /login?redirect=<path>&error=<code>. `redirect` is reduced to a same-origin path while the URL is parsed, so no
 * component ever sees an outside address; `error` is the code a failed Google sign-in comes back with.
 */
export const loginSearchSchema = v.object({
  redirect: v.optional(
    v.pipe(
      v.string(),
      v.transform(path => safeRedirect(path)),
    ),
  ),
  error: v.optional(v.string()),
})

/**
 * /verify-email?email=&code= and /reset-password?email=&code=: the link in the email fills both fields (on
 * /reset-password it opens the code step).
 */
export const verifyEmailSearchSchema = v.object({ email: v.optional(v.string()), code: v.optional(v.string()) })

/**
 * The emailed confirmation link opened by an account already signed in with that address unconfirmed (sign-up signs
 * in at once, so this is the usual case): /verify-email stays, prefilled, instead of the guest redirect home that
 * dropped the code and left it to be typed into the banner.
 */
export const opensVerifyLink = (
  location: { pathname: string; search?: Record<string, unknown> },
  session: { user: { email_verified: boolean } } | null,
): boolean =>
  session !== null &&
  !session.user.email_verified &&
  location.pathname === '/verify-email' &&
  typeof location.search?.['code'] === 'string'

const Banner = lazy(() => import('./ui/email-banner').then(module => ({ default: module.EmailBanner })))

/** The shell's «Подтвердите email» banner: browser only (it reads session storage), its module loaded on demand. */
export function EmailBannerSlot() {
  const hydrated = useHydrated()
  return hydrated ? createElement(Suspense, { fallback: null }, createElement(Banner)) : null
}
