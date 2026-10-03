import { useSuspenseQuery } from '@tanstack/react-query'
import { Outlet, useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { sessionOptions } from '#/shared/auth/session'
import { formatDate } from '#/shared/i18n/format'
import { Badge } from '#/shared/ui/badge'
import { Link } from '#/shared/ui/link'
import { DetailPage } from '#/shared/ui/templates/detail-page'

import { authorNames } from '../model/course'
import { contributorsOptions, courseOptions } from '../queries'
import { LearnerAction } from './course-action'

const TABS = [
  { to: '/courses/$courseId/about', label: m.platform_tab_about },
  { to: '/courses/$courseId/updates', label: m.platform_tab_updates },
  { to: '/courses/$courseId/discussions', label: m.platform_tab_discussions },
] as const

/** The course page (spec 5.4): title, authors, one primary action, then the about / updates / discussions tabs. */
export function CoursePage() {
  const { courseId } = useParams({ from: '/_public/courses/$courseId' })
  const { data: course } = useSuspenseQuery(courseOptions(courseId))
  const { data: roster } = useSuspenseQuery(contributorsOptions(courseId))
  const { data: session } = useSuspenseQuery(sessionOptions())
  const authors = authorNames(roster)
  const meta = [
    authors.length > 0 ? m.course_authors({ names: authors.join(', ') }) : null,
    m.course_updated({ date: formatDate(course.updated_at_unix) }),
  ]
  return (
    <DetailPage
      title={course.name}
      meta={meta.filter(Boolean).join(' · ')}
      status={course.archived_at_unix ? <Badge tone="warning">{m.course_archived()}</Badge> : null}
      primaryAction={
        session ? (
          <LearnerAction course={course} />
        ) : (
          // A guest's "Enrol" signs in first and comes back here (UX-021).
          <Link to="/login" search={{ redirect: `/courses/${courseId}/about` }} variant="primary">
            {m.course_enroll()}
          </Link>
        )
      }
      tabs={TABS.map(tab => (
        <Link key={tab.to} variant="tab" to={tab.to} params={{ courseId }}>
          {tab.label()}
        </Link>
      ))}
    >
      <Outlet />
    </DetailPage>
  )
}
