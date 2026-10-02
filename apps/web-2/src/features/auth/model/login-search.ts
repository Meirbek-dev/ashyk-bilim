import * as v from 'valibot'

import type { GoogleStartData } from '#/shared/api/gen/types.gen'
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

const GOOGLE_START: GoogleStartData['url'] = '/api/v2/auth/google'

/**
 * googleStart() is a browser navigation (a 303 to Google's consent screen), not a fetch: the button is a link to
 * its URL. After sign-in the server sends the browser on to `callback`.
 */
export const googleStartHref = (callback: string): string =>
  `${GOOGLE_START}?callback=${encodeURIComponent(safeRedirect(callback))}`

/** Whole minutes to wait after a 429, from `Retry-After` seconds; null when the server gave no time. */
export const retryMinutes = (retryAfterSeconds: number | null): number | null =>
  retryAfterSeconds === null ? null : Math.max(1, Math.ceil(retryAfterSeconds / 60))
