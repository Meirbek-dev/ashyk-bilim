import { useQueryClient } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { Course } from '#/shared/api/gen/types.gen'
import { buttonVariants } from '#/shared/components/button-variants'
import { StatusScreen } from '#/shared/components/status-screen'

import { can } from '../model/course'
import { courseOptions } from '../queries'

/**
 * The 409 `course-archived` of an archived course: read-only for its team too, so «not on the team» would be
 * false. Who may restore it gets the way to the settings; a co-author learns who can.
 */
export function ArchivedCourse({ courseId }: { courseId: string }) {
  // The loader that refused has just read the course: its allowed actions say who may restore.
  const course = useQueryClient().getQueryData<Course>(courseOptions(courseId).queryKey)
  if (course && can(course, 'restore')) {
    return (
      <StatusScreen title={m.studio_archived_activity_title()} text={m.studio_archived_activity_text()}>
        <RouterLink to="/teach/courses/$courseId/settings" params={{ courseId }} className={buttonVariants()}>
          {m.studio_archived_activity_restore()}
        </RouterLink>
      </StatusScreen>
    )
  }
  return (
    <StatusScreen title={m.studio_archived_activity_title()} text={m.studio_archived_course_text()}>
      <RouterLink to="/courses/$courseId" params={{ courseId }} className={buttonVariants()}>
        {m.studio_not_on_team_page()}
      </RouterLink>
      <RouterLink to="/teach/courses" className={buttonVariants({ variant: 'outline' })}>
        {m.studio_not_on_team_mine()}
      </RouterLink>
    </StatusScreen>
  )
}
