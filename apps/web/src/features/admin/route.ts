// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import * as v from 'valibot'

const blankToUndefined = v.pipe(
  v.string(),
  v.trim(),
  v.transform(text => text || undefined),
)

/** /admin/users?q=&user=: the directory search and the user open in the side panel (by id: shareable). */
export const usersSearchSchema = v.object({ q: v.optional(blankToUndefined), user: v.optional(blankToUndefined) })
export type UsersSearch = v.InferOutput<typeof usersSearchSchema>
