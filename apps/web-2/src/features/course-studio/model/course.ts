import * as v from 'valibot'

import { ApiError } from '#/shared/api/errors'
import type { Course, CourseAction, CourseSummary } from '#/shared/api/gen/types.gen'

import type { Preset } from '../route'

export type { CoursesSearch, Preset } from '../route'

// What the route loaders and the workspace frame need, apart from the rest of the model.

export const can = (course: Pick<Course, 'allowed_actions'>, action: CourseAction): boolean =>
  course.allowed_actions.includes(action)

/** The workspace opens for whoever may edit the course, or restore it (an archived course allows nothing else). */
export const opensWorkspace = (course: Pick<Course, 'allowed_actions'>): boolean =>
  can(course, 'update') || can(course, 'restore')

/**
 * The refusal of a course the caller cannot open or change, as the server answers a write to it: 409
 * `course-archived` when it is archived (its team included), 403 `forbidden` when it is not theirs.
 */
export const courseRefusal = (course: Pick<Course, 'archived_at_unix'> | null): ApiError =>
  course?.archived_at_unix
    ? new ApiError({ status: 409, code: 'course-archived', fieldErrors: [], requestId: null, retryAfter: null })
    : new ApiError({ status: 403, code: 'forbidden', fieldErrors: [], requestId: null, retryAfter: null })

/** A 412: someone saved the object after this page loaded it (its `version` is stale). */
export const isStale = (error: unknown): boolean => error instanceof ApiError && error.status === 412

export type CourseStatus = 'draft' | 'published' | 'archived'

/** Archived wins over published: an archived course keeps `public` but is read-only for everyone. */
export const courseStatus = (course: Pick<Course, 'public' | 'archived_at_unix'>): CourseStatus =>
  course.archived_at_unix ? 'archived' : course.public ? 'published' : 'draft'

/** The search box's own form value (Enter submits; the URL is the source of truth). */
export const searchBoxSchema = v.object({ q: v.string() })

/** The count the header shows for the current preset, from the server's `summary`. */
/**
 * No course at all, archived ones included (B-CST-49): `total` leaves the archive out, and a teacher who archived
 * their only course must still see the «Архив» preset to get it back.
 */
export const hasNoCourses = (summary: CourseSummary): boolean => summary.total + summary.archived === 0

export function presetCount(summary: CourseSummary, preset: Preset | undefined): number {
  if (preset === 'drafts') return summary.private
  if (preset === 'published') return summary.ready
  if (preset === 'archived') return summary.archived
  return summary.total
}
