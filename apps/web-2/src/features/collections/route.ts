// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import * as v from 'valibot'

import { searchText } from '#/shared/lib/search-text'

/**
 * /collections?q=&create=: the name search (blank is no search, so "?q=" and "/collections" are the same list) and the
 * create dialog opened by the old `/collections/new` (B-COL-18).
 */
export const collectionsSearchSchema = v.object({
  create: v.fallback(v.optional(v.boolean()), undefined),
  q: v.optional(
    v.pipe(
      searchText,
      // A NUL (`%00`) is dropped, as in the catalog: the search API refuses it.
      v.transform(text => text.replaceAll('\0', '')),
      v.trim(),
      v.transform(text => text || undefined),
    ),
  ),
})
