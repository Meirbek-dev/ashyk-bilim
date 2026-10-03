// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import * as v from 'valibot'

/** /courses/$courseId/discussions?thread=<post id>: the post whose replies are open (spec 7.8: URL state). */
export const discussionsSearchSchema = v.object({ thread: v.optional(v.string()) })
