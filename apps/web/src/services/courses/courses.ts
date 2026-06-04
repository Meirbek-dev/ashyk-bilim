'use server'

import { apiFetch, errorHandling, getResponseMetadata } from '@/lib/api-client'
import type { CustomResponseTyping } from '@/lib/api-client'
import type { components } from '@/lib/api/generated'
import type { ApiErrorLike } from '@/types/shared'
import { getAPIUrl } from '@services/config/config'
import { courseTag, tags } from '@/lib/cacheTags'

/*
 This file includes POST, PUT, DELETE requests and cached GET requests
*/

type CourseRead = components['schemas']['CourseRead']
type CourseReadWithPermissions = components['schemas']['CourseReadWithPermissions']
type FullCourseRead = components['schemas']['FullCourseRead']
type AuthorWithRole = components['schemas']['AuthorWithRole']
type NormalizedCourseAuthor = Omit<AuthorWithRole, 'user'> & {
  user: {
    id: number
    user_uuid: string
    avatar_image: string
    first_name: string
    middle_name?: string
    last_name: string
    username: string
  }
}
type NormalizedCourse = Omit<
  CourseRead,
  'about' | 'authors' | 'description' | 'learnings' | 'tags' | 'thumbnail_image' | 'thumbnail_type' | 'thumbnail_video'
> & {
  about: string
  authors: NormalizedCourseAuthor[]
  description: string
  learnings: string
  mini_description: string
  tags: string[]
  thumbnail_image: string
  thumbnail_type?: Exclude<CourseRead['thumbnail_type'], null>
  thumbnail_video: string
}
type NormalizedCourseWithPermissions = Omit<
  CourseReadWithPermissions,
  'about' | 'authors' | 'description' | 'learnings' | 'tags' | 'thumbnail_image' | 'thumbnail_type' | 'thumbnail_video'
> & {
  about: string
  authors: NormalizedCourseAuthor[]
  description: string
  learnings: string
  mini_description: string
  tags: string[]
  thumbnail_image: string
  thumbnail_type?: Exclude<CourseReadWithPermissions['thumbnail_type'], null>
  thumbnail_video: string
}
type NormalizedFullCourse = Omit<
  FullCourseRead,
  | 'about'
  | 'authors'
  | 'chapters'
  | 'course_uuid'
  | 'creation_date'
  | 'description'
  | 'learnings'
  | 'tags'
  | 'thumbnail_image'
  | 'thumbnail_type'
  | 'thumbnail_video'
  | 'update_date'
> & {
  about: string
  authors: NormalizedCourseAuthor[]
  chapters: NonNullable<FullCourseRead['chapters']>
  course_uuid: string
  creation_date?: string
  description: string
  learnings: string
  mini_description: string
  tags: string[]
  thumbnail_image: string
  thumbnail_type?: Exclude<FullCourseRead['thumbnail_type'], null>
  thumbnail_video: string
  update_date?: string
}

type ResponseMetadata<T> = Omit<CustomResponseTyping, 'data'> & {
  data: T | null
}

interface EditableCoursesSummary {
  total: number
  ready: number
  private: number
  attention: number
}

async function getTypedResponseMetadata<T>(response: Response): Promise<ResponseMetadata<T>> {
  return await getResponseMetadata<T | null>(response)
}

function normalizeTags(rawTags: string | null | undefined): string[] {
  if (!rawTags) {
    return []
  }

  try {
    const parsed = JSON.parse(rawTags)
    if (Array.isArray(parsed)) {
      return parsed.filter((tag): tag is string => typeof tag === 'string')
    }
  } catch {
    // Fall back to treating the stored value as a comma-delimited string.
  }

  return rawTags
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
}

function normalizeAuthors(authors: AuthorWithRole[] | undefined): NormalizedCourseAuthor[] {
  return (authors ?? []).map(author => {
    const { user, ...restAuthor } = author

    return Object.assign(restAuthor, {
      user: {
        id: user.id,
        user_uuid: user.user_uuid ?? '',
        avatar_image: user.avatar_image ?? '',
        first_name: user.first_name ?? '',
        last_name: user.last_name ?? '',
        username: user.username,
        ...(user.middle_name === null || user.middle_name === undefined ? {} : { middle_name: user.middle_name }),
      },
    })
  })
}

function normalizeCourse(course: CourseRead): NormalizedCourse {
  const {
    about,
    authors,
    description,
    learnings,
    tags: courseTags,
    thumbnail_image,
    thumbnail_type,
    thumbnail_video,
    ...rest
  } = course

  return {
    ...rest,
    about: about ?? '',
    authors: normalizeAuthors(authors),
    description: description ?? '',
    learnings: learnings ?? '',
    mini_description: description ?? '',
    tags: normalizeTags(courseTags),
    thumbnail_image: thumbnail_image ?? '',
    thumbnail_video: thumbnail_video ?? '',
    ...(thumbnail_type === null || thumbnail_type === undefined ? {} : { thumbnail_type }),
  }
}

function normalizeCourseWithPermissions(course: CourseReadWithPermissions): NormalizedCourseWithPermissions {
  const {
    about,
    authors,
    description,
    learnings,
    tags: courseTags,
    thumbnail_image,
    thumbnail_type,
    thumbnail_video,
    ...rest
  } = course

  return {
    ...rest,
    about: about ?? '',
    authors: normalizeAuthors(authors),
    description: description ?? '',
    learnings: learnings ?? '',
    mini_description: description ?? '',
    tags: normalizeTags(courseTags),
    thumbnail_image: thumbnail_image ?? '',
    thumbnail_video: thumbnail_video ?? '',
    ...(thumbnail_type === null || thumbnail_type === undefined ? {} : { thumbnail_type }),
  }
}

function normalizeFullCourse(course: FullCourseRead): NormalizedFullCourse {
  const {
    about,
    authors,
    chapters,
    course_uuid,
    creation_date,
    description,
    learnings,
    tags: courseTags,
    thumbnail_image,
    thumbnail_type,
    thumbnail_video,
    update_date,
    ...rest
  } = course

  return {
    ...rest,
    about: about ?? '',
    authors: normalizeAuthors(authors),
    chapters: chapters ?? [],
    course_uuid: course_uuid ?? '',
    description: description ?? '',
    learnings: learnings ?? '',
    mini_description: description ?? '',
    tags: normalizeTags(courseTags),
    thumbnail_image: thumbnail_image ?? '',
    thumbnail_video: thumbnail_video ?? '',
    ...(creation_date === null || creation_date === undefined ? {} : { creation_date }),
    ...(thumbnail_type === null || thumbnail_type === undefined ? {} : { thumbnail_type }),
    ...(update_date === null || update_date === undefined ? {} : { update_date }),
  }
}

/**
 * Cached fetch for courses
 * Uses `use cache` directive for cacheComponents
 * Returns both courses and total count for pagination
 */
async function fetchCourses(
  page = 1,
  limit = 20,
): Promise<{ courses: NormalizedCourseWithPermissions[]; total: number }> {
  const result = await apiFetch(`courses/page/${page}/limit/${limit}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    baseUrl: getAPIUrl(),
    timeoutMs: 10_000,
  })

  if (!result.ok) {
    const error: ApiErrorLike = new Error(result.statusText || 'Request failed')
    error.status = result.status
    throw error
  }

  const courses = ((await result.json()) as CourseReadWithPermissions[]).map(course =>
    normalizeCourseWithPermissions(course),
  )
  const total = Number.parseInt(result.headers.get('X-Total-Count') ?? '0', 10)

  return { courses, total }
}

export async function getCourses(_next?: unknown, page = 1, limit = 20) {
  return fetchCourses(page, limit)
}

/**
 * Cached fetch for courses the current user can edit
 */
async function fetchEditableCourses(
  page = 1,
  limit = 20,
  query = '',
  sortBy = 'updated',
  preset = '',
): Promise<{
  courses: NormalizedCourseWithPermissions[]
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

  const result = await apiFetch(
    `courses/editable/page/${page}/limit/${limit}${queryParams.size > 0 ? `?${queryParams.toString()}` : ''}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      baseUrl: getAPIUrl(),
      timeoutMs: 10_000,
    },
  )

  if (result.status === 401 || result.status === 403) {
    return {
      courses: [],
      total: 0,
      summary: { total: 0, ready: 0, private: 0, attention: 0 },
    }
  }

  if (!result.ok) {
    const error: ApiErrorLike = new Error(result.statusText || 'Request failed')
    error.status = result.status
    throw error
  }

  const courses = ((await result.json()) as CourseReadWithPermissions[]).map(course =>
    normalizeCourseWithPermissions(course),
  )
  const total = Number.parseInt(result.headers.get('X-Total-Count') ?? '0', 10)
  const summary = {
    total: Number.parseInt(result.headers.get('X-Summary-Total') ?? String(total), 10),
    ready: Number.parseInt(result.headers.get('X-Summary-Ready') ?? '0', 10),
    private: Number.parseInt(result.headers.get('X-Summary-Private') ?? '0', 10),
    attention: Number.parseInt(result.headers.get('X-Summary-Attention') ?? '0', 10),
  }

  return { courses, total, summary }
}

export async function getEditableCourses(page = 1, limit = 20, query = '', sortBy = 'updated', preset = '') {
  return fetchEditableCourses(page, limit, query, sortBy, preset)
}

export async function getCourseUserRights(course_uuid: string) {
  const result = await apiFetch(`courses/${course_uuid}/rights`)
  return await errorHandling(result)
}

export async function searchCourses(query: string, page = 1, limit = 20) {
  const result = await apiFetch(`courses/search?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`)
  const courses: CourseRead[] = await errorHandling(result)
  return courses.map(course => normalizeCourse(course))
}

/**
 * Cached fetch for course metadata
 */
async function fetchCourseMetadata(
  course_uuid: string,
  withUnpublishedActivities = false,
): Promise<NormalizedFullCourse> {
  const normalizedCourseUuid = course_uuid.startsWith('course_') ? course_uuid : `course_${course_uuid}`
  const result = await apiFetch(
    `courses/${normalizedCourseUuid}/meta?with_unpublished_activities=${withUnpublishedActivities}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      baseUrl: getAPIUrl(),
      timeoutMs: 10_000,
    },
  )
  return normalizeFullCourse(await errorHandling(result))
}

export async function getCourseMetadata(course_uuid: string, _next?: unknown, withUnpublishedActivities = false) {
  return fetchCourseMetadata(course_uuid, withUnpublishedActivities)
}

interface CourseWriteOptions {
  lastKnownUpdateDate?: string | null | undefined
  includeEditableList?: boolean
  includePublicList?: boolean
}

const toCourseMetadataPayload = (data: AppPayload, options?: CourseWriteOptions) => ({
  name: data.name,
  description: data.description ?? '',
  about: data.about ?? '',
  learnings: Array.isArray(data.learnings) ? JSON.stringify(data.learnings) : data.learnings,
  tags: Array.isArray(data.tags) ? JSON.stringify(data.tags) : data.tags,
  thumbnail_type: data.thumbnail_type,
  last_known_update_date: options?.lastKnownUpdateDate ?? data.update_date ?? undefined,
})

export async function updateCourseMetadata(course_uuid: string, data: AppPayload, options?: CourseWriteOptions) {
  const result = await apiFetch(`courses/${course_uuid}/metadata`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toCourseMetadataPayload(data, options)),
  })
  const metadata = await getTypedResponseMetadata<NormalizedCourse>(result)

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.courses, 'max')
    revalidateTag(courseTag.detail(course_uuid), 'max')
    revalidateTag(courseTag.editableList(), 'max')
    revalidateTag(courseTag.publicList(), 'max')
  }

  return metadata
}

export async function updateCourseAccess(course_uuid: string, data: AppPayload, options?: CourseWriteOptions) {
  const result = await apiFetch(`courses/${course_uuid}/access`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...data,
      last_known_update_date: options?.lastKnownUpdateDate ?? data.update_date ?? undefined,
    }),
  })
  const metadata = await getTypedResponseMetadata<NormalizedCourse>(result)

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.courses, 'max')
    revalidateTag(courseTag.detail(course_uuid), 'max')
    revalidateTag(courseTag.access(course_uuid), 'max')
    revalidateTag(courseTag.editableList(), 'max')
    revalidateTag(courseTag.publicList(), 'max')
  }

  return metadata
}

/**
 * Cached fetch for full course data
 */
async function fetchCourse(course_uuid: string): Promise<NormalizedCourse> {
  const result = await apiFetch(`courses/${course_uuid}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    baseUrl: getAPIUrl(),
    timeoutMs: 10_000,
  })
  return normalizeCourse(await errorHandling(result))
}

export async function getCourse(course_uuid: string, _next?: unknown) {
  return fetchCourse(course_uuid)
}

export async function updateCourseThumbnail(course_uuid: string, formData: FormData, options?: CourseWriteOptions) {
  if (options?.lastKnownUpdateDate) {
    formData.set('last_known_update_date', options.lastKnownUpdateDate)
  }

  const result = await apiFetch(`courses/${course_uuid}/thumbnail`, {
    method: 'PUT',
    body: formData,
  })
  const metadata = await getTypedResponseMetadata<NormalizedCourse>(result)

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.courses, 'max')
    revalidateTag(courseTag.detail(course_uuid), 'max')
    revalidateTag(courseTag.editableList(), 'max')
    revalidateTag(courseTag.publicList(), 'max')
  }

  return metadata
}

export async function createNewCourse(
  course_body: AppPayload,
  thumbnail: Blob | File | null | undefined,
  _options?: Pick<CourseWriteOptions, 'includeEditableList' | 'includePublicList'>,
) {
  const { name = '', description = '', learnings = '', tags: courseTags = '', template, visibility } = course_body

  // Send file thumbnail as form data
  const formData = new FormData()
  formData.append('name', name)
  formData.append('description', description)
  formData.append('public', String(visibility ?? false))
  formData.append('learnings', Array.isArray(learnings) ? JSON.stringify(learnings) : learnings || '')
  formData.append('tags', Array.isArray(courseTags) ? JSON.stringify(courseTags) : courseTags || '')
  formData.append('about', description)

  // Pass template so the backend can seed starter chapters atomically
  if (template && template !== 'outline') {
    formData.append('template', template)
  }

  if (thumbnail) {
    formData.append('thumbnail', thumbnail)
  }

  const result = await apiFetch(`courses`, { method: 'POST', body: formData })
  const metadata = await getTypedResponseMetadata<NormalizedCourse>(result)

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.courses, 'max')
    revalidateTag(tags.editableCourses, 'max')
    revalidateTag(courseTag.editableList(), 'max')
    revalidateTag(courseTag.publicList(), 'max')
  }

  return metadata
}

/**
 * Search editable courses for the outline template combobox.
 * Not cached — used for interactive search.
 */
export async function searchEditableCourses(query: string, limit = 20) {
  const result = await apiFetch(
    `courses/editable/page/1/limit/${limit}?query=${encodeURIComponent(query)}&sort_by=updated`,
  )
  if (!result.ok) return []
  const courses = ((await result.json()) as CourseReadWithPermissions[]).map(course =>
    normalizeCourseWithPermissions(course),
  )
  return Array.isArray(courses) ? courses : []
}

export async function deleteCourseFromBackend(
  course_uuid: string,
  _options?: Pick<CourseWriteOptions, 'includeEditableList' | 'includePublicList'>,
) {
  const result = await apiFetch(`courses/${course_uuid}`, { method: 'DELETE' })
  const data = await errorHandling(result)
  const deletionSucceeded =
    result.ok && (!('success' in (data as Record<string, unknown>)) || Boolean((data as { success?: unknown }).success))

  if (deletionSucceeded) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.courses, 'max')
    revalidateTag(tags.editableCourses, 'max')
    revalidateTag(courseTag.detail(course_uuid), 'max')
    revalidateTag(courseTag.editableList(), 'max')
    revalidateTag(courseTag.publicList(), 'max')
  }

  return data
}

export async function editContributor(
  course_uuid: string,
  contributor_id: number,
  authorship: string | undefined,
  authorship_status: string | undefined,
  _options?: Pick<CourseWriteOptions, 'includeEditableList' | 'includePublicList'>,
) {
  const result = await apiFetch(
    `courses/${course_uuid}/contributors/${contributor_id}?authorship=${authorship}&authorship_status=${authorship_status}`,
    { method: 'PUT' },
  )
  const metadata = await getResponseMetadata(result)

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(courseTag.contributors(course_uuid), 'max')
    revalidateTag(courseTag.detail(course_uuid), 'max')
  }

  return metadata
}

export async function applyForContributor(course_uuid: string, data: AppPayload) {
  const result = await apiFetch(`courses/${course_uuid}/apply-contributor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const metadata = await getResponseMetadata(result)

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(courseTag.contributors(course_uuid), 'max')
    revalidateTag(courseTag.detail(course_uuid), 'max')
  }

  return metadata
}

export async function bulkAddContributors(
  course_uuid: string,
  data: string[],
  _options?: Pick<CourseWriteOptions, 'includeEditableList' | 'includePublicList'>,
) {
  const result = await apiFetch(`courses/${course_uuid}/bulk-add-contributors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const metadata = await getResponseMetadata(result)

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(courseTag.contributors(course_uuid), 'max')
    revalidateTag(courseTag.detail(course_uuid), 'max')
  }

  return metadata
}

export async function bulkRemoveContributors(
  course_uuid: string,
  data: string[],
  _options?: Pick<CourseWriteOptions, 'includeEditableList' | 'includePublicList'>,
) {
  const result = await apiFetch(`courses/${course_uuid}/bulk-remove-contributors`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const metadata = await getResponseMetadata(result)

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(courseTag.contributors(course_uuid), 'max')
    revalidateTag(courseTag.detail(course_uuid), 'max')
  }

  return metadata
}
