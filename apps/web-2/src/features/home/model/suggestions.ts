import type { CourseListItem } from '#/shared/api/gen/types.gen'

type Suggestable = Pick<CourseListItem, 'progress' | 'allowed_actions'>

/**
 * Courses an empty /home may offer to start (B-HOME-13): not one the caller already took (any progress, finished
 * included) and not one they teach (they may edit it); at most `limit`, in the list's order.
 */
export function suggestedCourses<T extends Suggestable>(courses: readonly T[], limit = 3): T[] {
  return courses
    .filter(course => course.progress === null && !course.allowed_actions.includes('update'))
    .slice(0, limit)
}
