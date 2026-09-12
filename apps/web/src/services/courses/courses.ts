'use server'

import { apiJson, apiResult } from '@/lib/api-client'
import { Contributor, Course, CoursePage, CourseReadiness as CourseReadinessSchema, Curriculum } from '@/lib/api/generated/zod'
import type { AddContributorRequest, ReadinessItem, UpdateContributorRequest } from '@/lib/api/generated/zod'
import { emptyPage } from '@/lib/api/contract'
import type { Page } from '@/lib/api/contract'
import { stripEntityPrefix, toAppChapter, toAppCourse } from '@/hooks/courses/courseKeys'
import { getAPIUrl } from '@services/config/config'
import { courseTag, tags } from '@/lib/cacheTags'

/*
 This file includes POST, PUT, DELETE requests and cached GET requests
*/

export type NormalizedCourseWithPermissions = AppCourse

const serverGet = () => ({ method: 'GET', baseUrl: getAPIUrl(), timeoutMs: 10_000 })

const toTagArray = (raw: unknown): string[] => {
  if (Array.isArray(raw)) return raw.filter((tag): tag is string => typeof tag === 'string')
  if (typeof raw !== 'string' || !raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((tag): tag is string => typeof tag === 'string')
  } catch {
    // comma-delimited fallback below
  }
  return raw
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
}

async function revalidateCourse(course_uuid?: string) {
  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.courses, 'max')
  revalidateTag(tags.editableCourses, 'max')
  revalidateTag(courseTag.editableList(), 'max')
  revalidateTag(courseTag.publicList(), 'max')
  if (course_uuid) revalidateTag(courseTag.detail(course_uuid), 'max')
}

/**
 * Public catalog page. The v2 listing is keyset (`{items, next_cursor}`); `page`
 * is emulated by walking `page - 1` cursor hops so the legacy page-numbered
 * callers keep working, and `total` is only a lower bound they use to decide
 * whether a next page exists.
 * ponytail: drop `page`/`total` once callers pass `next_cursor` back as `cursor`.
 */
export async function getCourses(_next?: unknown, page = 1, limit = 20) {
  let cursor: string | null | undefined
  let result: Page<Course> = emptyPage()
  for (let hop = 1; hop <= page; hop += 1) {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set('cursor', cursor)
    result = await apiJson(`courses?${params}`, serverGet(), CoursePage.parse)
    cursor = result.next_cursor
    if (!cursor && hop < page) {
      result = emptyPage()
      break
    }
  }

  const courses = result.items.map(toAppCourse)
  const next_cursor = result.next_cursor ?? null
  const total = (page - 1) * limit + courses.length + (next_cursor ? 1 : 0)
  return { courses, total, next_cursor }
}

/**
 * Course + curriculum in the `AppCourse` shape (`chapters[].activities[]`).
 * Unpublished activities are dropped unless `withUnpublishedActivities` is set.
 */
export async function getCourseMetadata(
  course_uuid: string,
  _next?: unknown,
  withUnpublishedActivities = false,
): Promise<AppCourse> {
  const id = stripEntityPrefix(course_uuid)
  const [course, curriculum] = await Promise.all([
    apiJson(`courses/${id}`, serverGet(), Course.parse),
    apiJson(`courses/${id}/curriculum`, serverGet(), Curriculum.parse),
  ])
  const chapters = curriculum.chapters.map(chapter =>
    toAppChapter(
      withUnpublishedActivities
        ? chapter
        : { ...chapter, activities: chapter.activities.filter(activity => activity.published) },
    ),
  )
  return { ...toAppCourse(course), chapters }
}

interface CourseWriteOptions {
  lastKnownUpdateDate?: string | null | undefined
  includeEditableList?: boolean
  includePublicList?: boolean
}

const toUpdateCourseRequest = (data: AppPayload) => ({
  ...(data.name === undefined ? {} : { name: data.name }),
  ...(data.description === undefined ? {} : { description: data.description }),
  ...(data.about === undefined ? {} : { about: data.about }),
  ...(data.tags === undefined ? {} : { tags: toTagArray(data.tags) }),
  ...(typeof data.open_to_contributors === 'boolean' ? { open_to_contributors: data.open_to_contributors } : {}),
  ...(typeof data.thumbnail_upload_id === 'string' ? { thumbnail_upload_id: data.thumbnail_upload_id } : {}),
})

async function patchCourse(course_uuid: string, body: ReturnType<typeof toUpdateCourseRequest>) {
  const id = stripEntityPrefix(course_uuid)
  const result = await apiResult(
    `courses/${id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    Course.parse,
  )
  await revalidateCourse(id)
  return { ...result, data: toAppCourse(result.data) }
}

/** `learnings` / `thumbnail_type` are not in the v2 `UpdateCourseRequest` and are dropped. */
export async function updateCourseMetadata(course_uuid: string, data: AppPayload, _options?: CourseWriteOptions) {
  return patchCourse(course_uuid, toUpdateCourseRequest(data))
}

/** `public` goes through the lifecycle route; everything else is a plain course PATCH. */
export async function updateCourseAccess(course_uuid: string, data: AppPayload, options?: CourseWriteOptions) {
  if (typeof data.public === 'boolean') return updateCourseLifecycle(course_uuid, data.public, options)
  return patchCourse(course_uuid, toUpdateCourseRequest(data))
}

export interface CourseReadinessIssue {
  /** Server code (`no-live-activity`, `assessment-not-ready`, …), localized by the web. */
  code: string
  severity: 'blocker' | 'warning'
  activity_id: string | null
  /** The activity's name when the issue points at one. */
  title: string | null
  /** Studio link for activity-scoped issues. */
  path: string | null
}

export interface CourseReadiness {
  ready: boolean
  issues: CourseReadinessIssue[]
}

/** `GET courses/{id}/readiness` (server-side rule set; codes documented on the route). */
export async function getCourseReadiness(courseUuid: string): Promise<CourseReadiness> {
  const id = stripEntityPrefix(courseUuid)
  const readiness = await apiJson(`courses/${id}/readiness`, serverGet(), CourseReadinessSchema.parse)
  const issue =
    (severity: CourseReadinessIssue['severity']) =>
    (item: ReadinessItem): CourseReadinessIssue => ({
      code: item.code,
      severity,
      activity_id: item.activity_id ?? null,
      title: item.title ?? null,
      path: item.activity_id ? `/dash/courses/${id}/activity/${item.activity_id}/studio` : null,
    })
  return {
    ready: readiness.ready,
    issues: [...readiness.blockers.map(issue('blocker')), ...readiness.warnings.map(issue('warning'))],
  }
}

export async function updateCourseLifecycle(courseUuid: string, makePublic: boolean, _options?: CourseWriteOptions) {
  const id = stripEntityPrefix(courseUuid)
  const result = await apiResult(
    `courses/${id}/lifecycle`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: makePublic ? 'publish' : 'unpublish' }),
    },
    Course.parse,
  )
  await revalidateCourse(id)
  return { ...result, data: toAppCourse(result.data) }
}

/** Claim a finalized `course-thumbnail` upload (`uploadFile(file, 'course-thumbnail').id`) as the thumbnail. */
export async function updateCourseThumbnail(course_uuid: string, uploadId: string) {
  return patchCourse(course_uuid, { thumbnail_upload_id: uploadId })
}

/**
 * `POST courses` (JSON), then publish through the lifecycle route when asked.
 * `thumbnail` and `template` have no v2 contract yet and are ignored.
 */
export async function createNewCourse(
  course_body: AppPayload,
  _thumbnail: Blob | File | null | undefined,
  _options?: Pick<CourseWriteOptions, 'includeEditableList' | 'includePublicList'>,
) {
  const { name = '', description = '', tags: courseTags = '', visibility } = course_body

  const result = await apiResult(
    'courses',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, about: description, tags: toTagArray(courseTags) }),
    },
    Course.parse,
  )
  const course = visibility ? (await updateCourseLifecycle(result.data.id, true)).data : toAppCourse(result.data)
  await revalidateCourse()

  return { ...result, data: course }
}

export async function deleteCourseFromBackend(
  course_uuid: string,
  _options?: Pick<CourseWriteOptions, 'includeEditableList' | 'includePublicList'>,
) {
  const id = stripEntityPrefix(course_uuid)
  const data = await apiJson(`courses/${id}`, { method: 'DELETE' })
  await revalidateCourse(id)
  return data
}

/* Contributors — `courses/{id}/contributors` (roles creator|maintainer|contributor|reporter, statuses pending|active|inactive). */

async function revalidateContributors(course_uuid: string) {
  const { revalidateTag } = await import('next/cache')
  revalidateTag(courseTag.contributors(course_uuid), 'max')
  revalidateTag(courseTag.detail(course_uuid), 'max')
}

export async function getContributors(course_uuid: string): Promise<Contributor[]> {
  const id = stripEntityPrefix(course_uuid)
  return apiJson(`courses/${id}/contributors`, serverGet(), data => Contributor.array().parse(data))
}

export async function addContributor(course_uuid: string, body: AddContributorRequest): Promise<Contributor> {
  const id = stripEntityPrefix(course_uuid)
  const result = await apiJson(
    `courses/${id}/contributors`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    Contributor.parse,
  )
  await revalidateContributors(id)
  return result
}

export async function editContributor(
  course_uuid: string,
  user_id: string,
  body: UpdateContributorRequest,
): Promise<Contributor> {
  const id = stripEntityPrefix(course_uuid)
  const result = await apiJson(
    `courses/${id}/contributors/${user_id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    Contributor.parse,
  )
  await revalidateContributors(id)
  return result
}

export async function removeContributor(course_uuid: string, user_id: string): Promise<void> {
  const id = stripEntityPrefix(course_uuid)
  await apiJson(`courses/${id}/contributors/${user_id}`, { method: 'DELETE' })
  await revalidateContributors(id)
}

/** `POST courses/{id}/contributors/apply` → `contributor/pending`; 409 `conflict` when already on the roster or the course is closed. */
export async function applyForContributor(course_uuid: string): Promise<Contributor> {
  const id = stripEntityPrefix(course_uuid)
  const result = await apiJson(`courses/${id}/contributors/apply`, { method: 'POST' }, Contributor.parse)
  await revalidateContributors(id)
  return result
}
