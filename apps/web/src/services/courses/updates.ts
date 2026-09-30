// Plain isomorphic functions, NOT server actions: problem+json codes and
// field errors must reach the client `useApiError` (GAUNTLET BUG-035, UX-242).
// Nothing reads these cache tags (no `cacheTag()` consumer), so nothing is revalidated.
import { apiResult } from '@/lib/api-client'
import { CourseUpdate } from '@/lib/api/generated/zod'
import { stripEntityPrefix } from '@/hooks/courses/courseKeys'

/** `POST courses/{id}/updates` — answers 201 with the created `CourseUpdate`. */
export async function createCourseUpdate(body: AppPayload) {
  return apiResult(
    `courses/${stripEntityPrefix(body.course_uuid ?? '')}/updates`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: body.title, content: body.content }),
    },
    value => CourseUpdate.parse(value),
  )
}

/** `DELETE course-updates/{id}` — answers 204. */
export async function deleteCourseUpdate(_course_uuid: string, update_uuid: string | number) {
  return apiResult(`course-updates/${update_uuid}`, { method: 'DELETE' })
}
