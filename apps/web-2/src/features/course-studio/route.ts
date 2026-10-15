// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import * as v from 'valibot'

const blankToUndefined = v.pipe(
  v.string(),
  v.trim(),
  v.transform(text => text || undefined),
)

/** /teach/courses?q=&preset=&sort=: the name search, the server preset (none is "all") and the order (none: newest). */
export const coursesSearchSchema = v.object({
  q: v.optional(blankToUndefined),
  preset: v.optional(v.picklist(['drafts', 'published', 'archived'])),
  sort: v.fallback(v.optional(v.picklist(['name'])), undefined),
})
export type CoursesSearch = v.InferOutput<typeof coursesSearchSchema>
export type Preset = NonNullable<CoursesSearch['preset']>

/** /teach/courses/$courseId/learners?q=: the roster search (name, username or email, on the server). */
export const learnersSearchSchema = v.object({ q: v.optional(blankToUndefined) })
