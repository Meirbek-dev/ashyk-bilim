// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import * as v from 'valibot'

const id = v.fallback(v.optional(v.pipe(v.string(), v.uuid())), undefined)

/** `/teach/courses/$courseId/concepts?concept=&learner=`: the concept or the learner open in the side sheet. */
export const conceptsSearchSchema = v.object({ concept: id, learner: id })
export type ConceptsSearch = v.InferOutput<typeof conceptsSearchSchema>
