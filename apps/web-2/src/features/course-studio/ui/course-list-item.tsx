import { m } from '#/paraglide/messages'
import type { CourseListItem as Item } from '#/shared/api/gen/types.gen'
import { CourseCover } from '#/shared/components/course-cover'
import { Link } from '#/shared/components/link'
import { formatDate } from '#/shared/i18n/format'
import { Checkbox } from '#/shared/ui/checkbox'

import { courseStatus } from '../model/course'
import { CourseStatusText } from './course-status'

type CourseListItemProps = { course: Item; checked: boolean; onToggle: () => void }

/**
 * One course of the teacher's list: its bulk checkbox (B-CST-45), cover thumbnail, name into the workspace, status,
 * last change, learners and activities, and the work waiting for a grade as a link into the inbox (B-CST-01). Wide, the
 * counts stand in columns, so the rows read as a table; narrow, they are a line under the name.
 */
export function CourseListItem({ course, checked, onToggle }: CourseListItemProps) {
  const { teaching } = course
  return (
    <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-x-3 @4xl:grid-cols-[auto_auto_minmax(0,1fr)_6.5rem_7.5rem_11rem] @4xl:items-center @4xl:gap-x-4">
      <Checkbox
        className="mt-1 @4xl:mt-0"
        aria-label={m.studio_bulk_select({ name: course.name })}
        checked={checked}
        onCheckedChange={onToggle}
      />
      <CourseCover
        imageKey={course.thumbnail_key}
        className="row-span-3 aspect-video w-20 shrink-0 rounded-md border @4xl:row-span-1 @4xl:w-24"
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="min-w-0 text-base font-semibold wrap-anywhere">
          <Link variant="title" to="/teach/courses/$courseId/overview" params={{ courseId: course.id }}>
            {course.name}
          </Link>
        </h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          <CourseStatusText status={courseStatus(course)} />
          {' · '}
          <span>{m.studio_updated({ date: formatDate(course.updated_at_unix) })}</span>
        </p>
      </div>
      {teaching ? (
        <p className="col-start-3 flex flex-wrap gap-x-3 text-sm text-muted-foreground tabular-nums @4xl:contents">
          <span className="whitespace-nowrap @4xl:text-end">
            {m.studio_list_learners({ count: teaching.learners })}
          </span>
          <span className="whitespace-nowrap @4xl:text-end">
            {m.studio_list_activities({ count: teaching.activities })}
          </span>
        </p>
      ) : (
        <span aria-hidden className="hidden @4xl:col-span-2 @4xl:block" />
      )}
      {teaching && teaching.ungraded > 0 ? (
        <p className="col-start-3 text-sm tabular-nums @4xl:col-start-auto @4xl:text-end">
          <Link to="/teach" search={{ course: course.id }}>
            {m.studio_list_ungraded({ count: teaching.ungraded })}
          </Link>
        </p>
      ) : null}
    </div>
  )
}
