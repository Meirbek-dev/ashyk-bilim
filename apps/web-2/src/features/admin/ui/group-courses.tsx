import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { Usergroup } from '#/shared/api/gen/types.gen'
import { CourseCover } from '#/shared/components/course-cover'
import { DataList } from '#/shared/components/data-list'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { StatusBadge } from '#/shared/components/status-badge'

import { groupCoursesOptions } from '../group-queries'

/**
 * «Курсы группы» (OPEN-D-7): the courses the group is enrolled in that the viewer may see, by name - a course the
 * viewer edits opens its learners tab (where the link is managed), any other its course page. Linking stays on the
 * course side.
 */
export function GroupCourses({ group }: { group: Pick<Usergroup, 'id'> }) {
  const query = useSuspenseQuery(groupCoursesOptions(group.id))
  const courses = query.data
  return (
    <section aria-labelledby="group-courses" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="group-courses" className="text-xl font-semibold">
          {m.admin_group_courses()}
        </h2>
        {courses.length > 0 ? <p className="text-sm text-muted-foreground">{m.admin_group_courses_hint()}</p> : null}
      </div>
      <ListState
        pending={false}
        error={query.error}
        count={courses.length}
        filtered={false}
        emptyText={m.admin_group_courses_empty()}
        onRetry={() => void query.refetch()}
      >
        <DataList items={courses} getKey={course => course.id}>
          {course => (
            <div className="flex items-center gap-3">
              <CourseCover seed={course.id} imageKey={course.thumbnail_key} shape="thumb" className="w-20 shrink-0" />
              <p className="min-w-0 flex-1 wrap-anywhere">
                {course.can_write ? (
                  <Link to="/teach/courses/$courseId/learners" params={{ courseId: course.id }}>
                    {course.name}
                  </Link>
                ) : (
                  <Link to="/courses/$courseId" params={{ courseId: course.id }}>
                    {course.name}
                  </Link>
                )}
              </p>
              {course.archived ? (
                <StatusBadge tone="neutral">{m.admin_group_course_archived()}</StatusBadge>
              ) : course.published ? null : (
                <StatusBadge tone="warning">{m.admin_group_course_draft()}</StatusBadge>
              )}
            </div>
          )}
        </DataList>
      </ListState>
    </section>
  )
}
