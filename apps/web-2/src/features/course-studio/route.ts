// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import * as v from 'valibot'

import { searchText } from '#/shared/lib/search-text'

const blankToUndefined = v.pipe(
  searchText,
  v.trim(),
  v.transform(text => text || undefined),
)

/** /teach/courses?q=&preset=&sort=: the name search, the server preset (none is "all") and the order (none: newest). */
export const coursesSearchSchema = v.object({
  q: v.optional(blankToUndefined),
  preset: v.fallback(v.optional(v.picklist(['drafts', 'published', 'archived'])), undefined),
  sort: v.fallback(v.optional(v.picklist(['name'])), undefined),
})
export type CoursesSearch = v.InferOutput<typeof coursesSearchSchema>

/** The page's own URL: the list filters plus the create dialog opened by the old `/dash/courses/new`. */
export const coursesPageSearchSchema = v.object({
  ...coursesSearchSchema.entries,
  create: v.fallback(v.optional(v.boolean()), undefined),
})

/** The list filters of the page's URL (what the course list is loaded by). */
export const listFilters = ({ q, preset, sort }: CoursesSearch): CoursesSearch => ({ q, preset, sort })
export type Preset = NonNullable<CoursesSearch['preset']>

/** /teach/courses/$courseId/learners?q=: the roster search (name, username or email, on the server). */
export const learnersSearchSchema = v.object({ q: v.optional(blankToUndefined) })
