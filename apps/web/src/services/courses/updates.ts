'use server'

import { apiResult } from '@/lib/api-client'
import { CourseUpdate } from '@/lib/api/generated/zod'
import { stripEntityPrefix } from '@/hooks/courses/courseKeys'
import { tags } from '@/lib/cacheTags'

/** `POST courses/{id}/updates` — answers 201 with the created `CourseUpdate`. */
export async function createCourseUpdate(body: AppPayload) {
  const data = await apiResult(
    `courses/${stripEntityPrefix(String(body.course_uuid ?? ''))}/updates`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: body.title, content: body.content }),
    },
    CourseUpdate.parse,
  )

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.courses, 'max')

  return data
}

/** `DELETE course-updates/{id}` — answers 204. */
export async function deleteCourseUpdate(_course_uuid: string, update_uuid: string | number) {
  const data = await apiResult(`course-updates/${update_uuid}`, { method: 'DELETE' })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.courses, 'max')

  return data
}
