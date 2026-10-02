import * as v from 'valibot'

/** /login?redirect=<path>: the path is checked with safeRedirect() when it is used. */
export const loginSearchSchema = v.object({ redirect: v.optional(v.string()) })
