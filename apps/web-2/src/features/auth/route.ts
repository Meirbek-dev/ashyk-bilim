// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
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

/** /verify-email?email=&code=: the link in the verification email fills both fields. */
export const verifyEmailSearchSchema = v.object({ email: v.optional(v.string()), code: v.optional(v.string()) })
