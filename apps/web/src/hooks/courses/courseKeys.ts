import type { Activity, Chapter, Collection, Course, IssuedCertificate, Trail } from '@/lib/api/generated/zod'
import { unixToIso } from '@/lib/api/contract'

/** Accepts legacy `course_<id>` style params and returns the bare v2 id. */
export const stripEntityPrefix = (id: string) => id.replace(/^(?:course|chapter|activity|collection)_/u, '')

/*
 v2 → App shape adapters. The wire has UUID `id`s, `*_unix` timestamps and
 lowercase activity types; the components still read `*_uuid`, ISO dates and
 `TYPE_*` tokens. Adapt once here, never per caller.
 ponytail: delete these once components read the v2 fields directly.
*/

export function toAppCourse<T extends Course>(course: T) {
  const created = unixToIso(course.created_at_unix) ?? ''
  const updated = unixToIso(course.updated_at_unix) ?? ''
  return { ...course, course_uuid: course.id, created_at: created, creation_date: created, update_date: updated }
}

export const toWireActivityType = (token: string) => {
  const wire = token.replace(/^(?:SUB)?TYPE_/u, '').toLowerCase()
  return wire === 'custom' ? 'quiz' : wire
}

/** v2 calls the legacy `TYPE_CUSTOM` activity a `quiz`; every renderer still keys on `TYPE_CUSTOM`. */
export const toAppActivityType = (wire: string) => (wire === 'quiz' ? 'TYPE_CUSTOM' : `TYPE_${wire.toUpperCase()}`)

export function toAppActivity<T extends Activity>(activity: T) {
  return {
    ...activity,
    activity_uuid: activity.id,
    activity_type: toAppActivityType(activity.activity_type),
    activity_sub_type: `SUBTYPE_${activity.activity_sub_type.toUpperCase()}`,
  }
}

export function toAppChapter<T extends Chapter & { activities?: Activity[] }>(chapter: T) {
  const { activities, ...rest } = chapter
  return {
    ...rest,
    chapter_uuid: chapter.id,
    ...(activities ? { activities: activities.map(toAppActivity) } : {}),
  }
}

export function toAppCollection(collection: Collection): AppCollection {
  // `AppCollection.id` is still typed numeric; drop it until that type moves to string.
  const { id, courses, ...rest } = collection
  return { ...rest, collection_uuid: id, courses: courses.map(toAppCourse) }
}

export function toAppTrail(trail: Trail): AppTrailData {
  return { ...trail, runs: trail.runs.map(run => ({ ...run, course: toAppCourse(run.course) })) }
}

export function toAppCertification(issued: IssuedCertificate): AppCertification {
  const { certificate, certification, course } = issued
  return {
    ...issued,
    certification_uuid: certification.id,
    course: toAppCourse(course),
    // `user_certification_uuid` is the public verify code: the client links `/certificates/{code}/verify`.
    certificate_user: {
      ...certificate,
      user_certification_uuid: certificate.verify_code,
      created_at: unixToIso(certificate.issued_at_unix) ?? '',
    },
    certification: { ...certification, config: certification.config as AppCertification['certification']['config'] },
  }
}

export interface CourseListKeyOptions {
  page?: number
  limit?: number
  cursor?: string | null
  query?: string
  sortBy?: string
  preset?: string
}

const buildQueryString = (params: Record<string, string | number | null | undefined>) => {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    searchParams.set(key, String(value))
  }

  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

const normalizeCourseListOptions = ({
  page = 1,
  limit = 20,
  cursor,
  query,
  sortBy,
  preset,
}: CourseListKeyOptions = {}) => ({
  limit,
  page,
  ...(cursor ? { cursor } : {}),
  ...(preset ? { preset } : {}),
  ...(query ? { query } : {}),
  ...(sortBy ? { sortBy } : {}),
})

export const courseEndpoints = {
  /** Keyset page (`{items, next_cursor}`); `page` is ignored, pass `cursor`. */
  list: ({ limit = 20, cursor }: CourseListKeyOptions = {}) => `courses${buildQueryString({ limit, cursor })}`,

  detail: (courseUuid: string) => `courses/${stripEntityPrefix(courseUuid)}`,

  curriculum: (courseUuid: string) => `courses/${stripEntityPrefix(courseUuid)}/curriculum`,

  // No v2 route yet (blocked).
  rights: (courseUuid: string) => `courses/${stripEntityPrefix(courseUuid)}/rights`,

  // No v2 route yet (blocked).
  contributors: (courseUuid: string) => `courses/${stripEntityPrefix(courseUuid)}/contributors`,

  chapter: (chapterUuid: string) => `chapters/${stripEntityPrefix(chapterUuid)}`,

  activity: (activityUuid: string) => `activities/${stripEntityPrefix(activityUuid)}`,
}

export const courseKeys = {
  all: ['courses'] as const,

  list: (options: CourseListKeyOptions = {}) => ['courses', 'list', normalizeCourseListOptions(options)] as const,

  detail: (courseUuid: string) => ['courses', 'detail', stripEntityPrefix(courseUuid)] as const,

  structure: (courseUuid: string, withUnpublishedActivities = false) =>
    ['courses', 'structure', stripEntityPrefix(courseUuid), withUnpublishedActivities] as const,

  rights: (courseUuid: string) => ['courses', 'rights', stripEntityPrefix(courseUuid)] as const,

  contributors: (courseUuid: string) => ['courses', 'contributors', stripEntityPrefix(courseUuid)] as const,

  editorBundle: (courseUuid?: string | null) =>
    courseUuid ? (['courses', 'editor-bundle', stripEntityPrefix(courseUuid)] as const) : null,

  chapter: (chapterUuid: string) => ['chapters', 'detail', chapterUuid] as const,

  activity: (activityUuid: string) => ['activities', 'detail', activityUuid] as const,
}
