import { useSuspenseQuery } from '@tanstack/react-query'

import type { Course } from '#/shared/api/gen/types.gen'

import { learnerStateOptions } from '../queries'
import { LeaveCourse } from './leave-course'

/**
 * The last line of the course page for an enrolled learner: rare and destructive, so it closes the page under a
 * hairline, on the page's left edge, instead of standing alone between two sections. An archived course is
 * read-only: the server refuses to let anyone leave it (409).
 */
export function LeaveCourseRow({ course }: { course: Course }) {
  const { data: state } = useSuspenseQuery(learnerStateOptions(course.id))
  if (!state.enrolled || course.archived_at_unix) return null
  return (
    <div className="border-t pt-4">
      {/* The ghost button's label, not its padding, stands on the page's left edge. */}
      <div className="-ml-4">
        <LeaveCourse course={course} />
      </div>
    </div>
  )
}
