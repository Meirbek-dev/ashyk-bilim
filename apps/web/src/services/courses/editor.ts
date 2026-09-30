import { apiResult } from '@/lib/api-client'
import { getApiErrorMessage, isApiError } from '@/lib/api/assertSuccess'
import { stripEntityPrefix } from '@/hooks/courses/courseKeys'
import type { Contributor } from '@/lib/api/generated/zod'

export interface CourseEditorResource<T> {
  data: T | null
  status: number
  error: string | null
  available: boolean
}

export interface CourseEditorBundle {
  contributors: CourseEditorResource<Contributor[]>
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
  contributors: createResource<Contributor[]>(null, 0, null, false),
  linkedUserGroups: createResource<unknown[]>(null, 0, null, false),
  certifications: createResource<unknown[]>(null, 0, null, false),
})

const fetchArrayResource = async <T>(path: string): Promise<CourseEditorResource<T[]>> => {
  try {
    const response = await apiResult(path)
    return createResource((Array.isArray(response.data) ? response.data : []) as T[], 200, null, true)
  } catch (error) {
    if (isApiError(error) && (error.status === 401 || error.status === 403)) {
      return createResource<T[]>(null, error.status, null, false)
    }
    if (isApiError(error)) {
      return createResource<T[]>([], error.status, getApiErrorMessage(error.data, error.message), true)
    }
    throw error
  }
}

export async function getCourseEditorBundle(courseUuid: string): Promise<CourseEditorBundle> {
  const id = stripEntityPrefix(courseUuid)
  const [contributors, linkedUserGroups, certifications] = await Promise.all([
    fetchArrayResource<Contributor>(`courses/${id}/contributors`),
    fetchArrayResource<unknown>(`courses/${id}/usergroups`),
    fetchArrayResource<unknown>(`courses/${id}/certifications`),
  ])

  return { contributors, linkedUserGroups, certifications }
}
