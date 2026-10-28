// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import * as v from 'valibot'

import { searchText } from '#/shared/lib/search-text'

/** `?run=` - the run whose verdicts are shown; `?submission=` - the past attempt whose code is open (B-COD-08, 11). */
export const arenaSearchSchema = v.object({
  run: v.fallback(v.optional(searchText), undefined),
  submission: v.fallback(v.optional(searchText), undefined),
})
