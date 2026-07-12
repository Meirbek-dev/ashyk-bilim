import { apiResult } from '@/lib/api-client'
import { getApiErrorMessage, isApiError } from '@/lib/api/assertSuccess'

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
  const [contributors, linkedUserGroups, certifications] = await Promise.all([
    fetchArrayResource<AppCourseAuthor>(`courses/${courseUuid}/contributors`),
    fetchArrayResource<unknown>(`usergroups/resource/${courseUuid}`),
    fetchArrayResource<unknown>(`certifications/course/${courseUuid}`),
  ])

  return {
    contributors,
    linkedUserGroups,
    certifications,
  }
}
