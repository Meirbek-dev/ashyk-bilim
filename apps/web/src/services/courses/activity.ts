'use server'

import { apiJson } from '@/lib/api-client'
import { tags } from '@/lib/cacheTags'

/*
 This file includes only POST, PUT, DELETE requests
*/

export async function startCourse(course_uuid: string): Promise<AppPayload> {
  const data = await apiJson<AppPayload>(`trail/add_course/${course_uuid}`, {
    method: 'POST',
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.courses, 'max')

  return data
}

export async function removeCourse(course_uuid: string): Promise<AppPayload> {
  const data = await apiJson<AppPayload>(`trail/remove_course/${course_uuid}`, {
    method: 'DELETE',
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.courses, 'max')

  return data
}

export async function markActivityAsComplete(activity_uuid: string): Promise<AppPayload> {
  const data = await apiJson<AppPayload>(`trail/add_activity/${activity_uuid}`, {
    method: 'POST',
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.courses, 'max')

  return data
}

export async function unmarkActivityAsComplete(activity_uuid: string): Promise<AppPayload> {
  const data = await apiJson<AppPayload>(`trail/remove_activity/${activity_uuid}`, {
    method: 'DELETE',
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.courses, 'max')

  return data
}

export async function getCurrentTrail(): Promise<AppTrailData | null> {
  try {
    return await apiJson<AppTrailData>('trail', { method: 'GET' })
  } catch {
    return null
  }
}
