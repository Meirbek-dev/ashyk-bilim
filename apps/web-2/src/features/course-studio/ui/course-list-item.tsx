import { m } from '#/paraglide/messages'
import type { CourseListItem as Item } from '#/shared/api/gen/types.gen'
import { CourseCover } from '#/shared/components/course-cover'
import { Link } from '#/shared/components/link'
import { formatDate } from '#/shared/i18n/format'
import { Checkbox } from '#/shared/ui/checkbox'

import { courseStatus } from '../model/course'
import { CourseStatusBadge } from './course-status'

type CourseListItemProps = { course: Item; checked: boolean; onToggle: () => void }

/**
 * One course of the teacher's list: its bulk checkbox (B-CST-45), cover thumbnail, name into the workspace, status,
 * last change, learners and activities, and the work waiting for a grade as a link into the inbox (B-CST-01).
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
        <p className="text-sm text-muted-foreground tabular-nums">
          {[
            m.studio_updated({ date: formatDate(course.updated_at_unix) }),
            ...(course.teaching
              ? [
                  m.studio_list_learners({ count: course.teaching.learners }),
                  m.studio_list_activities({ count: course.teaching.activities }),
                ]
              : []),
          ].join(' · ')}
        </p>
        {course.teaching && course.teaching.ungraded > 0 ? (
          <p className="text-sm">
            <Link to="/teach" search={{ course: course.id }}>
              {m.studio_list_ungraded({ count: course.teaching.ungraded })}
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  )
}
