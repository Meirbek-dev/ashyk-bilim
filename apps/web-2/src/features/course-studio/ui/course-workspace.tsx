import { useSuspenseQuery } from '@tanstack/react-query'
import { Outlet, Link as RouterLink, useMatch, useParams } from '@tanstack/react-router'
import { Eye } from 'lucide-react'

import { TabLinks } from '#/features/platform'
import { m } from '#/paraglide/messages'
import { CourseCover } from '#/shared/components/course-cover'
import { Link } from '#/shared/components/link'
import { DetailPage } from '#/shared/components/templates/detail-page'
import { formatDate } from '#/shared/i18n/format'
import { buttonVariants } from '#/shared/components/button-variants'

import { can, courseStatus } from '../model/course'
import { courseOptions } from '../queries'
import { CourseStatusText } from './course-status'

/**
 * The course workspace (spec 5.4): the course's name and status over 7 tab routes (from the route's staticData), and
 * the course page as its learners see it (B-CST-43; staff open activities there as previews). An archived course says
 * since when and links to its restore (B-CST-44).
 */
export function CourseWorkspace() {
  const { courseId } = useParams({ from: '/_authed/teach/courses/$courseId' })
  const { staticData } = useMatch({ from: '/_authed/teach/courses/$courseId' })
  const { data: course } = useSuspenseQuery(courseOptions(courseId))
  return (
    <DetailPage
      cover={<CourseCover imageKey={course.thumbnail_key} className="aspect-video w-full rounded-lg border" />}
      coverSize="thumb"
      title={course.name}
      meta={
        course.archived_at_unix ? (
          <>
            <CourseStatusText status={courseStatus(course)} />
            {' · '}
            <span>{m.studio_archived_since({ date: formatDate(course.archived_at_unix) })}</span>
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
          <>
            <CourseStatusText status={courseStatus(course)} />
            {' · '}
            <span>{m.studio_updated({ date: formatDate(course.updated_at_unix) })}</span>
          </>
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
      tabs={<TabLinks tabs={staticData.tabs ?? []} />}
    >
      <Outlet />
    </DetailPage>
  )
}
