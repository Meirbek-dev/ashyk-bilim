import type { CourseListItem, UserId } from '#/shared/api/gen/types.gen'

type Suggestable = Pick<CourseListItem, 'progress' | 'authors'>

/**
 * Courses an empty /home may offer to start (B-HOME-13): not one the caller already took (any progress, finished
 * included) and not one they make or teach (an author: the creator or a contributor); at most `limit`, in the list's
 * order. Authorship, not the right to edit: an administrator may edit every course and still gets suggestions.
 */
export function suggestedCourses<T extends Suggestable>(
  courses: readonly T[],
  userId: UserId | undefined,
  limit = 3,
): T[] {
  return courses
    .filter(course => course.progress === null && !course.authors.some(author => author.user_id === userId))
    .slice(0, limit)
}
