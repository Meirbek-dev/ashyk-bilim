// Plain isomorphic function, NOT a server action: a 403 problem+json must reach
// the client `toastApiError` (GAUNTLET BUG-035, UX-166).
import { apiJson } from '@/lib/api-client'
import { stripEntityPrefix } from '@/hooks/courses/courseKeys'
import { revalidateCourse } from '@services/courses/courses'

export async function deleteCourseFromBackend(course_uuid: string): Promise<void> {
  const id = stripEntityPrefix(course_uuid)
  await apiJson(`courses/${id}`, { method: 'DELETE' })
  await revalidateCourse(id)
}
