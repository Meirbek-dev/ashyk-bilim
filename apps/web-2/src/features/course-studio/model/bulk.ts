import type { Course } from '#/shared/api/gen/types.gen'

/** What the course list does to several courses at once (B-CST-45), as the old course table's bulk bar. */
export const BULK_ACTIONS = ['publish', 'unpublish', 'archive', 'restore', 'delete'] as const
export type BulkAction = (typeof BULK_ACTIONS)[number]

/** The selected courses whose `allowed_actions` let the caller do it; the rest are skipped and counted. */
export const bulkTargets = <C extends Pick<Course, 'id' | 'allowed_actions'>>(
  courses: readonly C[],
  action: BulkAction,
): C[] => courses.filter(course => course.allowed_actions.includes(action))
