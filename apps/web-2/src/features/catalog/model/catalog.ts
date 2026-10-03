import * as v from 'valibot'

import type { Course, CoursePage, SessionInfo } from '#/shared/api/gen/types.gen'
import { availableWorkspaces, type Section, visibleSections, type Workspace } from '#/shared/auth/access'

import { COURSE_SORTS, courseSort, type CourseSort, type CoursesSearch, SEARCH_KINDS, type SearchKind } from '../route'

export type { CourseSort, SearchKind } from '../route'

export const isCourseSort = (value: string): value is CourseSort => v.is(courseSort, value)

/** "In progress first" means nothing to a guest: a guest is offered (and defaults to) the newest first. */
export const sortOptions = (signedIn: boolean): readonly CourseSort[] =>
  signedIn ? COURSE_SORTS : COURSE_SORTS.filter(sort => sort !== 'progress')

export function resolveSort(sort: CourseSort | undefined, signedIn: boolean): CourseSort {
  const options = sortOptions(signedIn)
  return sort && options.includes(sort) ? sort : (options[0] ?? 'updated')
}

/** The request behind the catalog list: the URL with the sort resolved for this caller. */
export const coursesFilter = (search: CoursesSearch, signedIn: boolean) => ({
  ...(search.q ? { q: search.q } : {}),
  sort: resolveSort(search.sort, signedIn),
})
export type CoursesFilter = ReturnType<typeof coursesFilter>

/** Keyset paging: the next request carries the previous page's opaque `next_cursor`. */
export const nextCoursesCursor = (page: CoursePage) => page.next_cursor ?? undefined

export const searchKinds = (signedIn: boolean): readonly SearchKind[] =>
  signedIn ? SEARCH_KINDS : SEARCH_KINDS.filter(kind => kind !== 'users')

/** `search` answers at most this many hits per section, without a cursor. */
export const SEARCH_LIMIT = 50
/** The palette shows a few hits per section and a link to the full search. */
export const PALETTE_LIMIT = 5

/** The search box's own form value (a form, so Enter submits; the URL is the source of truth). */
export const searchBoxSchema = v.object({ q: v.string() })

/** A course's state as a card badge: only the states a learner would not expect (B-CAT-03). */
export type CourseState = 'archived' | 'unpublished'
export function courseState(course: Pick<Course, 'public' | 'archived_at_unix'>): CourseState | null {
  if (course.archived_at_unix) return 'archived'
  return course.public ? null : 'unpublished'
}

/** Palette navigation: the sections the access table lets this user open, per workspace (B-CAT-11). */
export function paletteSections(
  session: SessionInfo | null,
  text: string,
): { workspace: Workspace; sections: Section[] }[] {
  const needle = text.trim().toLowerCase()
  return availableWorkspaces(session)
    .map(workspace => ({
      workspace,
      sections: visibleSections(session, workspace).filter(section => section.label().toLowerCase().includes(needle)),
    }))
    .filter(group => group.sections.length > 0)
}
