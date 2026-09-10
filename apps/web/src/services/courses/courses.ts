'use server'

import { apiJson, apiResult } from '@/lib/api-client'
import { isApiError } from '@/lib/api/assertSuccess'
import { Course, CoursePage, Curriculum } from '@/lib/api/generated/zod'
import { emptyPage } from '@/lib/api/contract'
import type { Page } from '@/lib/api/contract'
import { stripEntityPrefix, toAppChapter, toAppCourse } from '@/hooks/courses/courseKeys'
import { getAPIUrl } from '@services/config/config'
import { courseTag, tags } from '@/lib/cacheTags'

/*
 This file includes POST, PUT, DELETE requests and cached GET requests
*/

export type NormalizedCourseWithPermissions = AppCourse

interface EditableCoursesSummary {
  total: number
  ready: number
  private: number
  attention: number
}

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
 * Courses the current user can edit.
 * Blocked: no v2 route for `courses/editable` yet; kept as-is so the dashboard compiles.
 */
async function fetchEditableCourses(
  page = 1,
  limit = 20,
  query = '',
  sortBy = 'updated',
  preset = '',
): Promise<{
  courses: AppCourse[]
  total: number
  summary: EditableCoursesSummary
}> {
  const queryParams = new URLSearchParams()
  if (query?.trim()) {
    queryParams.set('query', query.trim())
  }
  if (sortBy) {
    queryParams.set('sort_by', sortBy)
  }
  if (preset?.trim()) {
    queryParams.set('preset', preset.trim())
  }

  let result: Awaited<ReturnType<typeof apiResult<AppCourse[]>>>
  try {
    result = await apiResult<AppCourse[]>(
      `courses/editable/page/${page}/limit/${limit}${queryParams.size > 0 ? `?${queryParams.toString()}` : ''}`,
      serverGet(),
    )
  } catch (error) {
    if (isApiError(error) && (error.status === 401 || error.status === 403)) {
      return {
        courses: [],
        total: 0,
        summary: { total: 0, ready: 0, private: 0, attention: 0 },
      }
    }
    throw error
  }

  const courses = Array.isArray(result.data) ? result.data : []
  const total = Number.parseInt(result.headers['x-total-count'] ?? '0', 10)
  const summary = {
    total: Number.parseInt(result.headers['x-summary-total'] ?? String(total), 10),
    ready: Number.parseInt(result.headers['x-summary-ready'] ?? '0', 10),
    private: Number.parseInt(result.headers['x-summary-private'] ?? '0', 10),
    attention: Number.parseInt(result.headers['x-summary-attention'] ?? '0', 10),
  }

  return { courses, total, summary }
}

export async function getEditableCourses(page = 1, limit = 20, query = '', sortBy = 'updated', preset = '') {
  return fetchEditableCourses(page, limit, query, sortBy, preset)
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

export interface CourseReadiness {
  ready: boolean
  issues: {
    code: string
    severity: 'blocker' | 'warning' | 'advice'
    message: string
    scope: string
    activity_uuid?: string | null
    path?: string | null
  }[]
  active_content_count: number
  scheduled_content_count: number
}

/** Blocked: no v2 route for `courses/{id}/readiness`. */
export async function getCourseReadiness(courseUuid: string): Promise<CourseReadiness> {
  return apiJson<CourseReadiness>(`courses/${stripEntityPrefix(courseUuid)}/readiness`, serverGet())
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

/** Blocked: no v2 route for `courses/{id}/thumbnail` (needs an `uploadFile()` + owner-attach contract). */
export async function updateCourseThumbnail(course_uuid: string, formData: FormData, options?: CourseWriteOptions) {
  if (options?.lastKnownUpdateDate) {
    formData.set('last_known_update_date', options.lastKnownUpdateDate)
  }

  const id = stripEntityPrefix(course_uuid)
  const result = await apiResult(`courses/${id}/thumbnail`, { method: 'PUT', body: formData }, Course.parse)
  await revalidateCourse(id)
  return { ...result, data: toAppCourse(result.data) }
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

/**
 * Search editable courses for the outline template combobox.
 * Blocked: no v2 route for `courses/editable`; resolves to `[]` on failure.
 */
export async function searchEditableCourses(query: string, limit = 20) {
  const courses = await apiJson<AppCourse[]>(
    `courses/editable/page/1/limit/${limit}?query=${encodeURIComponent(query)}&sort_by=updated`,
  ).catch(() => [])
  return Array.isArray(courses) ? courses : []
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

/* Contributors — blocked: no v2 routes for contributors / apply-contributor / bulk-*-contributors. */

export async function editContributor(
  course_uuid: string,
  contributor_id: number,
  authorship: string | undefined,
  authorship_status: string | undefined,
  _options?: Pick<CourseWriteOptions, 'includeEditableList' | 'includePublicList'>,
) {
  const metadata = await apiResult(
    `courses/${course_uuid}/contributors/${contributor_id}?authorship=${authorship}&authorship_status=${authorship_status}`,
    { method: 'PUT' },
  )

  const { revalidateTag } = await import('next/cache')
  revalidateTag(courseTag.contributors(course_uuid), 'max')
  revalidateTag(courseTag.detail(course_uuid), 'max')

  return metadata
}

export async function applyForContributor(course_uuid: string, data: AppPayload) {
  const metadata = await apiResult(`courses/${course_uuid}/apply-contributor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(courseTag.contributors(course_uuid), 'max')
  revalidateTag(courseTag.detail(course_uuid), 'max')

  return metadata
}

export async function bulkAddContributors(
  course_uuid: string,
  data: string[],
  _options?: Pick<CourseWriteOptions, 'includeEditableList' | 'includePublicList'>,
) {
  const metadata = await apiResult(`courses/${course_uuid}/bulk-add-contributors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(courseTag.contributors(course_uuid), 'max')
  revalidateTag(courseTag.detail(course_uuid), 'max')

  return metadata
}

export async function bulkRemoveContributors(
  course_uuid: string,
  data: string[],
  _options?: Pick<CourseWriteOptions, 'includeEditableList' | 'includePublicList'>,
) {
  const metadata = await apiResult(`courses/${course_uuid}/bulk-remove-contributors`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(courseTag.contributors(course_uuid), 'max')
  revalidateTag(courseTag.detail(course_uuid), 'max')

  return metadata
}
