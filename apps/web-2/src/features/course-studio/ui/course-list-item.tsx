import { m } from '#/paraglide/messages'
import type { Course } from '#/shared/api/gen/types.gen'
import { CourseCover } from '#/shared/components/course-cover'
import { Link } from '#/shared/components/link'
import { formatDate } from '#/shared/i18n/format'
import { Checkbox } from '#/shared/ui/checkbox'

import { courseStatus } from '../model/course'
import { CourseStatusBadge } from './course-status'

type CourseListItemProps = { course: Course; checked: boolean; onToggle: () => void }

/**
 * One course of the teacher's list: its bulk checkbox (B-CST-45), cover thumbnail, name into the workspace, status,
 * last change.
 */
export function CourseListItem({ course, checked, onToggle }: CourseListItemProps) {
  return (
    <div className="flex items-center gap-3">
      <Checkbox aria-label={m.studio_bulk_select({ name: course.name })} checked={checked} onCheckedChange={onToggle} />
      <CourseCover
        seed={course.id}
        imageKey={course.thumbnail_key}
        shape="thumb"
        className="aspect-video w-20 shrink-0 rounded-md border @sm:w-24"
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 text-base font-semibold wrap-anywhere">
            <Link to="/teach/courses/$courseId/overview" params={{ courseId: course.id }}>
              {course.name}
            </Link>
          </h2>
          <CourseStatusBadge status={courseStatus(course)} />
        </div>
        <p className="text-sm text-muted-foreground">
          {m.studio_updated({ date: formatDate(course.updated_at_unix) })}
        </p>
      </div>
    </div>
  )
}
