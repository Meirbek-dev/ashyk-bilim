import { apiFetch, getResponseMetadata } from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api/assertSuccess'

export interface CourseEditorResource<T> {
  data: T | null
  status: number
  error: string | null
  available: boolean
}

export interface CourseEditorBundle {
  contributors: CourseEditorResource<AppCourseAuthor[]>
  linkedUserGroups: CourseEditorResource<unknown[]>
  certifications: CourseEditorResource<unknown[]>
}

const createResource = <T>(
  data: T | null,
  status = 0,
  error: string | null = null,
  available = true,
): CourseEditorResource<T> => ({
  data,
  status,
  error,
  available,
})

export const createEmptyCourseEditorBundle = (): CourseEditorBundle => ({
  contributors: createResource<AppCourseAuthor[]>(null, 0, null, false),
  linkedUserGroups: createResource<unknown[]>(null, 0, null, false),
  certifications: createResource<unknown[]>(null, 0, null, false),
})

const toArrayResource = <T>(response: {
  success: boolean
  data: unknown
  status: number
  HTTPmessage: string
}): CourseEditorResource<T[]> => {
  if (response.status === 401 || response.status === 403) {
    return createResource<T[]>(null, response.status, null, false)
  }

  if (!response.success) {
    const detail = getApiErrorMessage(response.data, response.HTTPmessage || 'Request failed')
    return createResource<T[]>([], response.status, detail, true)
  }

  return createResource(
    (Array.isArray(response.data) ? response.data : []) as T[],
    response.status,
    null,
    true,
  )
}

export async function getCourseEditorBundle(courseUuid: string): Promise<CourseEditorBundle> {
  const [contributors, linkedUserGroups, certifications] = await Promise.all([
    apiFetch(`courses/${courseUuid}/contributors`).then(getResponseMetadata),
    apiFetch(`usergroups/resource/${courseUuid}`).then(getResponseMetadata),
    apiFetch(`certifications/course/${courseUuid}`).then(getResponseMetadata),
  ])

  return {
    contributors: toArrayResource<AppCourseAuthor>(contributors),
    linkedUserGroups: toArrayResource<unknown>(linkedUserGroups),
    certifications: toArrayResource<unknown>(certifications),
  }
}
