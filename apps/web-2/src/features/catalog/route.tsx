// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import { lazy, Suspense } from 'react'
import * as v from 'valibot'

import type { CourseListSort } from '#/shared/api/gen/types.gen'

/** Free text in the URL: trimmed, and blank is "no search", so `?q=` and no `q` are the same page. */
const queryText = v.optional(
  v.pipe(
    v.string(),
    v.trim(),
    v.transform(text => text || undefined),
  ),
)

/** `GET /courses?sort=`: the server's three orders (anything else is its `updated`). */
export type CourseSort = CourseListSort
export const COURSE_SORTS = ['progress', 'updated', 'name'] as const satisfies readonly CourseSort[]
export const courseSort = v.picklist(COURSE_SORTS)

/** /courses?q=&sort=. An unknown sort is dropped, i.e. the default (B-CAT-06). */
export const coursesSearchSchema = v.object({
  q: queryText,
  sort: v.fallback(v.optional(courseSort), undefined),
})
export type CoursesSearch = v.InferOutput<typeof coursesSearchSchema>

/** The sections of one `search` answer; people come only to signed-in callers (contract). */
export const SEARCH_KINDS = ['courses', 'collections', 'users'] as const
export type SearchKind = (typeof SEARCH_KINDS)[number]

/** /search?q=&kind=. No kind, or an unknown one, is "all" (BUG-382). */
export const searchPageSchema = v.object({
  q: queryText,
  kind: v.fallback(v.optional(v.picklist(SEARCH_KINDS)), undefined),
})

// The trigger (tooltip, hotkeys library) is not needed for the first paint: SSR renders it, the browser hydrates
// it when its chunk arrives, like the shell's menus. This keeps the entry chunk inside its budget (G-05).
const PaletteTrigger = lazy(() => import('./ui/palette-trigger').then(module => ({ default: module.PaletteTrigger })))

/** The shell's `search` slot (spec N-4): the command palette for everyone. */
export function CommandPalette() {
  return (
    <Suspense fallback={null}>
      <PaletteTrigger />
    </Suspense>
  )
}
