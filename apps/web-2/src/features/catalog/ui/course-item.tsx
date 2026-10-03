import { m } from '#/paraglide/messages'
import type { Course } from '#/shared/api/gen/types.gen'
import { formatDate } from '#/shared/i18n/format'
import { Badge } from '#/shared/ui/badge'
import { Link } from '#/shared/ui/link'

import { courseState, type CourseState } from '../model/catalog'

const stateLabels = {
  unpublished: m.catalog_course_state_unpublished,
  archived: m.catalog_course_state_archived,
} satisfies Record<CourseState, () => string>

/** One course card's content (inside DataList): name, description, date, and a badge for unusual states. */
export function CourseItem({ course, level = 2 }: { course: Course; level?: 2 | 3 }) {
  const Heading = level === 2 ? 'h2' : 'h3'
  const state = courseState(course)
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Heading className="min-w-0 text-lg font-medium wrap-anywhere">
          <Link to="/courses/$courseId" params={{ courseId: course.id }}>
            {course.name}
          </Link>
        </Heading>
        {state ? <Badge tone="neutral">{stateLabels[state]()}</Badge> : null}
      </div>
      {course.description ? <p className="line-clamp-3 wrap-anywhere">{course.description}</p> : null}
      <p className="text-sm text-muted-foreground">
        {m.catalog_course_updated({ date: formatDate(course.updated_at_unix) })}
      </p>
    </>
  )
}
