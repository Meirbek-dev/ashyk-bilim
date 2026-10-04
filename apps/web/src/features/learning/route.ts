// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import * as v from 'valibot'

export const RUN_STATES = ['in_progress', 'not_started', 'completed'] as const
export type RunState = (typeof RUN_STATES)[number]

/** /learning?state=: one state or all. An unknown value is the whole list, not an error page. */
export const learningSearchSchema = v.object({
  state: v.fallback(v.optional(v.picklist(RUN_STATES)), undefined),
})
