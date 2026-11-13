// Route-level code (validateSearch, loaderDeps): the route tree keeps it in the entry chunk, so this file imports
// nothing of the feature (AGENTS.md "Entry chunk").
import * as v from 'valibot'

import { searchText } from '#/shared/lib/search-text'

const id = v.fallback(v.optional(searchText), undefined)

/**
 * `/teach/courses/$courseId/import?chapter=&test=&import=`: the chapter a new test goes to (preselected), the activity
 * of an existing test whose questions are replaced or appended, and the uploaded file being previewed (a reload keeps
 * the preview while the server keeps the file, 24 h).
 */
export const importSearchSchema = v.object({ chapter: id, test: id, import: id })
