// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import * as v from 'valibot'

import { searchText } from '#/shared/lib/search-text'

const blankToUndefined = v.pipe(
  searchText,
  v.trim(),
  v.transform(text => text || undefined),
)

/**
 * /admin/users?q=&sort=&status=&role=&user=: the directory search, order (none: newest), status and role filters, and
 * the user open in the side panel (by id: shareable). An unknown order or status is the default.
 */
export const usersSearchSchema = v.object({
  q: v.optional(blankToUndefined),
  sort: v.fallback(v.optional(v.picklist(['name'])), undefined),
  status: v.fallback(v.optional(v.picklist(['active', 'disabled'])), undefined),
  role: v.optional(blankToUndefined),
  user: v.optional(blankToUndefined),
})
export type UsersSearch = v.InferOutput<typeof usersSearchSchema>
