import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import type { Course, CourseAuthor, CoursePage, SearchResults, SessionInfo } from '#/shared/api/gen/types.gen'
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

/** How many hits a section of the answer has: `lessons` is absent when there are none (CONTRACT-REQ-G-6). */
export const searchCount = (results: SearchResults, kind: SearchKind) => results[kind]?.length ?? 0

/** The search page asks for this many hits per section a page (the server's cap). */
export const SEARCH_LIMIT = 50

/**
 * The pages of one search, merged: each section's hits in order, and the sections that may have more (their last page
 * was full while the server still offers a cursor). Every section pages by the same cursor (hits shown per section).
 */
export function mergeSearchPages(pages: readonly SearchResults[], limit: number) {
  const last = pages.at(-1)
  const results: SearchResults = {
    courses: pages.flatMap(page => page.courses),
    lessons: pages.flatMap(page => page.lessons ?? []),
    collections: pages.flatMap(page => page.collections),
    users: pages.flatMap(page => page.users),
    next_cursor: last?.next_cursor ?? null,
  }
  const more: readonly SearchKind[] = SEARCH_KINDS.filter(
    kind => last?.next_cursor != null && searchCount(last, kind) >= limit,
  )
  return { results, more }
}
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

/** The card's author line: creator first (the server's order), each by display name, else username. */
export const authorNames = (authors: readonly Pick<CourseAuthor, 'display_name' | 'username'>[]): string =>
  authors.map(author => author.display_name.trim() || author.username).join(', ')

/** Palette navigation: the sections the access table lets this user open, per workspace (B-CAT-11). */
/** Where a palette course hit leads (B-CAT-12): the workspace of a course the user may edit, else its page. */
export const paletteCourseTarget = (course: Pick<Course, 'allowed_actions'>) =>
  course.allowed_actions.includes('update') ? ('/teach/courses/$courseId' as const) : ('/courses/$courseId' as const)

export function paletteSections(
  session: SessionInfo | null,
  text: string,
  gamification = true,
): { workspace: Workspace; sections: Section[] }[] {
  const needle = text.trim().toLowerCase()
  return availableWorkspaces(session)
    .map(workspace => ({
      workspace,
      sections: visibleSections(session, workspace, gamification).filter(section =>
        section.label().toLowerCase().includes(needle),
      ),
    }))
    .filter(group => group.sections.length > 0)
}

/** The settings pages (the settings route's tabs), in its order. */
const SETTINGS_PAGES = [
  { to: '/settings/profile', label: m.platform_tab_profile },
  { to: '/settings/security', label: m.platform_tab_security },
  { to: '/settings/appearance', label: m.platform_tab_appearance },
  { to: '/settings/notifications', label: m.platform_page_notifications },
] as const

export type SettingsPage = (typeof SETTINGS_PAGES)[number]

/**
 * The palette's settings group for a signed-in user: each page whose name holds the typed text, or all of them when
 * the group's own name does («настр»). A guest has no settings.
 */
export function paletteSettings(session: SessionInfo | null, text: string): SettingsPage[] {
  if (!session) return []
  const needle = text.trim().toLowerCase()
  if (m.platform_page_settings().toLowerCase().includes(needle)) return [...SETTINGS_PAGES]
  return SETTINGS_PAGES.filter(page => page.label().toLowerCase().includes(needle))
}

type PlatformTexts = {
  description: string
  about: string
  description_kk?: string | undefined
  description_en?: string | undefined
  about_kk?: string | undefined
  about_en?: string | undefined
}

/**
 * The platform's description and about text in the interface language (OPEN-G-4): the Kazakh or English version when
 * the admin wrote one, else the Russian (base) text.
 */
const translatedOr = (base: string, translated: string | undefined) => (translated?.trim() ? translated : base)

export function localizedPlatform<T extends PlatformTexts>(platform: T, locale: string): T {
  if (locale !== 'kk' && locale !== 'en') return platform
  return {
    ...platform,
    description: translatedOr(platform.description, platform[`description_${locale}`]),
    about: translatedOr(platform.about, platform[`about_${locale}`]),
  }
}

/**
 * The line under the platform's name on the landing: its description, else its about text, skipping one that only
 * repeats the name (prod has description = name) and the name it opens with («Ashyq Bilim - Образовательная
 * платформа...»: the heading above already says it); `undefined` lets the page say what the platform is itself.
 */
export function landingLead(platform: { name: string; description: string; about: string }): string | undefined {
  const name = platform.name.trim().toLowerCase()
  // The name alone, or the name and a separator before the rest; "Ashyqtau" is another word and stays.
  const withoutName = (text: string) => {
    if (!name || !text.toLowerCase().startsWith(name)) return text
    const rest = text.slice(name.length)
    return rest === '' ? '' : /^\s*[-–—:,]\s*/.test(rest) ? rest.replace(/^\s*[-–—:,]\s*/, '') : text
  }
  const lead = [platform.description, platform.about].map(text => withoutName(text.trim()).trim()).find(Boolean)
  return lead ? lead.charAt(0).toLocaleUpperCase() + lead.slice(1) : undefined
}
