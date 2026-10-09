// Plain isomorphic function, NOT a server action: a 403 problem+json must reach
// the client `toastApiError` (GAUNTLET BUG-035, UX-166).
import { apiJson } from '@/lib/api-client'
import { Course } from '@/lib/api/generated/zod'
import { stripEntityPrefix } from '@/hooks/courses/courseKeys'
import { revalidateCourse } from '@services/courses/courses'

export async function deleteCourseFromBackend(course_uuid: string): Promise<void> {
  const id = stripEntityPrefix(course_uuid)
  await apiJson(`courses/${id}`, { method: 'DELETE' })
  await revalidateCourse(id)
}

/**
 * `POST /courses/{id}/duplicate`: a private draft copy with chapters, activities and assessments (no learners,
 * grades or contributors). Returns the copy's id.
 */
export async function duplicateCourse(course_uuid: string, name: string): Promise<string> {
  const id = stripEntityPrefix(course_uuid)
  const copy = await apiJson(
    `courses/${id}/duplicate`,
    { method: 'POST', body: JSON.stringify({ name }) },
    (body: unknown) => Course.parse(body),
  )
  await revalidateCourse(copy.id)
  return copy.id
}
