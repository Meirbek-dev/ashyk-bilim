// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import * as v from 'valibot'

/** /collections?q=: the name search. Blank is no search, so "?q=" and "/collections" are the same list. */
export const collectionsSearchSchema = v.object({
  q: v.optional(
    v.pipe(
      v.string(),
      v.trim(),
      v.transform(text => text || undefined),
    ),
  ),
})
