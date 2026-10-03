// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import * as v from 'valibot'

/** `edit?item=`: the open question (unknown or absent: the first). */
export const builderSearchSchema = v.object({ item: v.optional(v.string()) })
