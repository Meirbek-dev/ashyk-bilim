import { useSuspenseQuery } from '@tanstack/react-query'
import { Outlet, Link as RouterLink, useMatch, useParams } from '@tanstack/react-router'
import { Eye } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { DetailPage } from '#/shared/components/templates/detail-page'
import { formatDate } from '#/shared/i18n/format'
import { buttonVariants } from '#/shared/ui/button'

import { can, courseStatus } from '../model/course'
import { courseOptions } from '../queries'
import { CourseStatusBadge } from './course-status'

/**
 * The course workspace (spec 5.4): the course's name and status over 7 tab routes (from the route's staticData), and
 * the course page as its learners see it (B-CST-43; staff open activities there as previews). An archived course says
 * since when and links to its restore (B-CST-44).
 */
export function CourseWorkspace() {
  const { courseId } = useParams({ from: '/_authed/teach/courses/$courseId' })
  const { staticData } = useMatch({ from: '/_authed/teach/courses/$courseId' })
  const { data: course } = useSuspenseQuery(courseOptions(courseId))
  const tabs = (staticData.tabs ?? []).map(tab => (
    <Link key={tab.to} variant="tab" to={tab.to} params={{ courseId }}>
      {tab.label()}
    </Link>
  ))
  return (
    <DetailPage
      title={course.name}
      status={<CourseStatusBadge status={courseStatus(course)} />}
      meta={
        course.archived_at_unix ? (
          <>
            {m.studio_archived_since({ date: formatDate(course.archived_at_unix) })}
            {can(course, 'restore') ? (
              <>
                {' · '}
                <Link to="/teach/courses/$courseId/settings" params={{ courseId }}>
                  {m.studio_restore()}
                </Link>
              </>
            ) : null}
          </>
        ) : (
          m.studio_updated({ date: formatDate(course.updated_at_unix) })
        )
      }
      primaryAction={
        <RouterLink
          to="/courses/$courseId"
          params={{ courseId }}
          target="_blank"
          className={buttonVariants({ variant: 'outline' })}
        >
          <Eye aria-hidden />
          {m.studio_preview()}
        </RouterLink>
      }
      tabs={tabs}
    >
      <Outlet />
    </DetailPage>
  )
}
