import type { CourseListItem, Enrollment, UserId } from '#/shared/api/gen/types.gen'

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

/**
 * Why an empty /home has nothing to continue (B-HOME-10): no course yet (`new`), every course finished (`done`), the
 * unfinished ones archived, where no work is taken any more (`archived`), or an open course with no next lesson now
 * (`waiting`: everything published is done, more may come).
 */
export function welcomeState(runs: readonly Pick<Enrollment, 'course' | 'learning_status'>[]) {
  if (runs.length === 0) return 'new'
  const unfinished = runs.filter(run => run.learning_status !== 'completed')
  if (unfinished.length === 0) return 'done'
  return unfinished.every(run => run.course.archived_at_unix !== null) ? 'archived' : 'waiting'
}
