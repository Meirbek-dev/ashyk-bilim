import * as v from 'valibot'

import { ApiError } from '#/shared/api/errors'
import type { Course, CourseAction, CourseSummary } from '#/shared/api/gen/types.gen'

// What the route loaders and the workspace frame need, apart from the rest of the model: the route tree (the
// initial bundle) carries only this.

export const can = (course: Pick<Course, 'allowed_actions'>, action: CourseAction): boolean =>
  course.allowed_actions.includes(action)

/** The workspace opens for whoever may edit the course, or restore it (an archived course allows nothing else). */
export const opensWorkspace = (course: Pick<Course, 'allowed_actions'>): boolean =>
  can(course, 'update') || can(course, 'restore')

/** A 412: someone saved the object after this page loaded it (its `version` is stale). */
export const isStale = (error: unknown): boolean => error instanceof ApiError && error.status === 412

export type CourseStatus = 'draft' | 'published' | 'archived'

/** Archived wins over published: an archived course keeps `public` but is read-only for everyone. */
export const courseStatus = (course: Pick<Course, 'public' | 'archived_at_unix'>): CourseStatus =>
  course.archived_at_unix ? 'archived' : course.public ? 'published' : 'draft'

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

/** The search box's own form value (Enter submits; the URL is the source of truth). */
export const searchBoxSchema = v.object({ q: v.string() })

/** The count the header shows for the current preset, from the server's `summary`. */
export function presetCount(summary: CourseSummary, preset: Preset | undefined): number {
  if (preset === 'drafts') return summary.private
  if (preset === 'published') return summary.ready
  if (preset === 'archived') return summary.archived
  return summary.total
}
