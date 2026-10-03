import { useSuspenseQuery } from '@tanstack/react-query'
import { Outlet, useMatch, useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { formatDate } from '#/shared/i18n/format'
import { Link } from '#/shared/ui/link'
import { DetailPage } from '#/shared/ui/templates/detail-page'

import { courseStatus } from '../model/course'
import { courseOptions } from '../queries'
import { CourseStatusBadge } from './course-status'

/** The course workspace (spec 5.4): the course's name and status over 7 tab routes (from the route's staticData). */
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
      meta={m.studio_updated({ date: formatDate(course.updated_at_unix) })}
      tabs={tabs}
    >
      <Outlet />
    </DetailPage>
  )
}
