// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import * as v from 'valibot'

const blankToUndefined = v.pipe(
  v.string(),
  v.trim(),
  v.transform(text => text || undefined),
)

/** /teach/courses?q=&preset=: the name search and the server preset; no preset is "all". */
export const coursesSearchSchema = v.object({
  q: v.optional(blankToUndefined),
  preset: v.optional(v.picklist(['drafts', 'published', 'archived'])),
})
export type CoursesSearch = v.InferOutput<typeof coursesSearchSchema>
export type Preset = NonNullable<CoursesSearch['preset']>
