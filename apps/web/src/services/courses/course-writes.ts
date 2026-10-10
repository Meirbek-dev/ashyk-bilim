// Plain isomorphic functions, NOT server actions: a 422 problem+json (e.g.
// `learnings`/`duplicate`) must reach the client `useApiError` with its field
// errors intact (GAUNTLET BUG-035, UX-242). Revalidation stays a server action.
import { apiResult } from '@/lib/api-client'
import { Course } from '@/lib/api/generated/zod'
import { stripEntityPrefix, toAppCourse } from '@/hooks/courses/courseKeys'
import { revalidateCourse } from '@services/courses/courses'

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

interface CourseWriteOptions {
  lastKnownUpdateDate?: string | null | undefined
  /** The course `version` the edit started from: sent as `If-Match`, a newer save elsewhere answers 412. */
  version?: number | undefined
  includeEditableList?: boolean
  includePublicList?: boolean
}

const toUpdateCourseRequest = (data: AppPayload) => ({
  ...(data.name === undefined ? {} : { name: data.name }),
  ...(data.description === undefined ? {} : { description: data.description }),
  ...(data.about === undefined ? {} : { about: data.about }),
  ...(data.tags === undefined ? {} : { tags: toTagArray(data.tags) }),
  ...(typeof data.open_to_contributors === 'boolean' ? { open_to_contributors: data.open_to_contributors } : {}),
  ...(typeof data.assessments_require_enrollment === 'boolean'
    ? { assessments_require_enrollment: data.assessments_require_enrollment }
    : {}),
  ...(typeof data.thumbnail_upload_id === 'string' || data.thumbnail_upload_id === null
    ? { thumbnail_upload_id: data.thumbnail_upload_id }
    : {}),
  ...(Array.isArray(data.learnings)
    ? {
        learnings: (data.learnings as unknown as { id?: string; text: string; emoji?: string | null }[]).map(
          ({ id, text, emoji }) => ({ id, text, emoji: emoji || null }),
        ),
      }
    : {}),
})

async function patchCourse(course_uuid: string, body: ReturnType<typeof toUpdateCourseRequest>, version?: number) {
  const id = stripEntityPrefix(course_uuid)
  const result = await apiResult(
    `courses/${id}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        // QA-D: without it a second author's save silently overwrote the first one's.
        ...(typeof version === 'number' ? { 'If-Match': `"${version}"` } : {}),
      },
      body: JSON.stringify(body),
    },
    value => Course.parse(value),
  )
  await revalidateCourse(id)
  return { ...result, data: toAppCourse(result.data) }
}

/** `thumbnail_type` is not in the v2 `UpdateCourseRequest` and is dropped. */
export async function updateCourseMetadata(course_uuid: string, data: AppPayload, options?: CourseWriteOptions) {
  return patchCourse(course_uuid, toUpdateCourseRequest(data), options?.version)
}

/** `public` goes through the lifecycle route; everything else is a plain course PATCH. */
export async function updateCourseAccess(course_uuid: string, data: AppPayload, options?: CourseWriteOptions) {
  if (typeof data.public === 'boolean') return updateCourseLifecycle(course_uuid, data.public, options)
  return patchCourse(course_uuid, toUpdateCourseRequest(data))
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
    value => Course.parse(value),
  )
  await revalidateCourse(id)
  return { ...result, data: toAppCourse(result.data) }
}

/**
 * `archive` freezes the course (read-only, undiscoverable), `restore` brings it
 * back as it was (COURSE_ARCHIVING.md). Roster managers only; a repeat is 409
 * `conflict`, publish / unpublish on an archived course 409 `course-archived`.
 */
export async function setCourseArchived(courseUuid: string, archived: boolean) {
  const id = stripEntityPrefix(courseUuid)
  const result = await apiResult(
    `courses/${id}/lifecycle`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: archived ? 'archive' : 'restore' }),
    },
    value => Course.parse(value),
  )
  await revalidateCourse(id)
  return { ...result, data: toAppCourse(result.data) }
}

/** Claim a finalized `course-thumbnail` upload (`uploadFile(file, 'course-thumbnail').id`) as the thumbnail. */
/** `null` removes the current thumbnail (UX-147). */
export async function updateCourseThumbnail(course_uuid: string, uploadId: string | null) {
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
    value => Course.parse(value),
  )
  const course = visibility ? (await updateCourseLifecycle(result.data.id, true)).data : toAppCourse(result.data)
  await revalidateCourse()

  return { ...result, data: course }
}
