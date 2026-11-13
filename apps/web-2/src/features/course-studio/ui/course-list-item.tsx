import { m } from '#/paraglide/messages'
import type { CourseListItem as Item } from '#/shared/api/gen/types.gen'
import { CourseCover } from '#/shared/components/course-cover'
import { Link } from '#/shared/components/link'
import { formatDate } from '#/shared/i18n/format'
import { Checkbox } from '#/shared/ui/checkbox'

import { courseStatus } from '../model/course'
import { CourseStatusText } from './course-status'

type CourseListItemProps = {
  course: Item
  /** Picking courses for a bulk action: the row's checkbox shows; otherwise the whole row opens the course. */
  selecting: boolean
  checked: boolean
  onToggle: () => void
}

/**
 * One course of the teacher's list: its bulk checkbox (B-CST-45), cover thumbnail, name into the workspace, status,
 * last change and the work waiting for a grade as a link into the inbox (B-CST-01), then learners and activities. Wide,
 * the two counts are columns that end on the page's right edge, so the rows read as a table; narrow, they are a line
 * under the name.
 */
export function CourseListItem({ course, selecting, checked, onToggle }: CourseListItemProps) {
  const { teaching } = course
  // Narrow, the counts sit under the name: the column after the picture (and the checkbox while picking).
  const under = selecting ? 'col-start-3' : 'col-start-2'
  return (
    <div
      className={`grid items-start gap-x-3 @4xl:items-center @4xl:gap-x-4 ${
        selecting
          ? 'grid-cols-[auto_auto_minmax(0,1fr)] @4xl:grid-cols-[auto_auto_minmax(0,1fr)_7.5rem_6.5rem]'
          : 'grid-cols-[auto_minmax(0,1fr)] @4xl:grid-cols-[auto_minmax(0,1fr)_7.5rem_6.5rem]'
      }`}
    >
      {selecting ? (
        <Checkbox
          className="mt-1 @4xl:mt-0"
          aria-label={m.studio_bulk_select({ name: course.name })}
          checked={checked}
          onCheckedChange={onToggle}
        />
      ) : null}
      <CourseCover
        imageKey={course.thumbnail_key}
        className="row-span-2 aspect-video w-20 shrink-0 rounded-md border @4xl:row-span-1 @4xl:w-24"
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="min-w-0 text-base font-semibold wrap-anywhere">
          <Link
            variant={selecting ? 'title' : 'stretched'}
            to="/teach/courses/$courseId/content"
            params={{ courseId: course.id }}
          >
            {course.name}
          </Link>
        </h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          <CourseStatusText status={courseStatus(course)} />
          {' · '}
          <span>{m.studio_updated({ date: formatDate(course.updated_at_unix) })}</span>
          {teaching && teaching.ungraded > 0 ? (
            <>
              {' · '}
              {/* Above the row's stretched link: this one opens the inbox, not the course. */}
              <span className="relative z-1 font-medium whitespace-nowrap text-foreground">
                <Link to="/teach" search={{ course: course.id }}>
                  {m.studio_list_ungraded({ count: teaching.ungraded })}
                </Link>
              </span>
            </>
          ) : null}
        </p>
      </div>
      {teaching ? (
        <p className={`${under} flex flex-wrap gap-x-3 text-sm text-muted-foreground tabular-nums @4xl:contents`}>
          <span className="whitespace-nowrap @4xl:text-end">
            {m.studio_list_learners({ count: teaching.learners })}
          </span>
          <span className="whitespace-nowrap @4xl:text-end">
            {m.studio_list_activities({ count: teaching.activities })}
          </span>
        </p>
      ) : null}
    </div>
  )
}
