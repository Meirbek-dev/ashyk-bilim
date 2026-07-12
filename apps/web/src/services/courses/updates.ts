'use server'

import { apiResult } from '@/lib/api-client'
import { tags } from '@/lib/cacheTags'

export async function createCourseUpdate(body: AppPayload) {
  const data = await apiResult(`courses/${body.course_uuid}/updates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.courses, 'max')

  return data
}

export async function deleteCourseUpdate(course_uuid: string, update_uuid: number) {
  const data = await apiResult(`courses/${course_uuid}/update/${update_uuid}`, {
    method: 'DELETE',
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.courses, 'max')

  return data
}
