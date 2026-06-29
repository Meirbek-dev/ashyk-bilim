'use server'

import { apiFetch, errorHandling } from '@/lib/api-client'
import { tags } from '@/lib/cacheTags'

/*
 This file includes only POST, PUT, DELETE requests
*/

export async function startCourse(course_uuid: string): Promise<AppPayload> {
  const result = await apiFetch(`trail/add_course/${course_uuid}`, {
    method: 'POST',
  })
  const data_result = await errorHandling<AppPayload>(result)

  if (result.ok) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.courses, 'max')
  }

  return data_result
}

export async function removeCourse(course_uuid: string): Promise<AppPayload> {
  const result = await apiFetch(`trail/remove_course/${course_uuid}`, {
    method: 'DELETE',
  })
  const data_result = await errorHandling<AppPayload>(result)

  if (result.ok) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.courses, 'max')
  }

  return data_result
}

export async function markActivityAsComplete(activity_uuid: string): Promise<AppPayload> {
  const result = await apiFetch(`trail/add_activity/${activity_uuid}`, {
    method: 'POST',
  })
  const data_result = await errorHandling<AppPayload>(result)

  if (result.ok) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.courses, 'max')
  }

  return data_result
}

export async function unmarkActivityAsComplete(activity_uuid: string): Promise<AppPayload> {
  const result = await apiFetch(`trail/remove_activity/${activity_uuid}`, {
    method: 'DELETE',
  })
  const data_result = await errorHandling<AppPayload>(result)

  if (result.ok) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.courses, 'max')
  }

  return data_result
}

export async function getCurrentTrail(): Promise<AppTrailData | null> {
  const result = await apiFetch('trail', { method: 'GET' })
  if (!result.ok) return null
  try {
    return (await result.json()) as AppTrailData
  } catch {
    return null
  }
}
