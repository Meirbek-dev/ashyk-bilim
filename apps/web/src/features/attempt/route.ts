// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import * as v from 'valibot'

/** `?attempt=<id>` picks the attempt (none: the entry), `?item=N` the question shown (1-based). */
export const attemptSearchSchema = v.object({
  attempt: v.fallback(v.optional(v.pipe(v.string(), v.uuid())), undefined),
  item: v.optional(v.fallback(v.pipe(v.number(), v.integer(), v.minValue(1)), 1)),
})
