import { useSuspenseQuery } from '@tanstack/react-query'
import { Outlet, useParams, Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { sessionOptions } from '#/shared/auth/session'
import { Link } from '#/shared/components/link'
import { StatusBadge } from '#/shared/components/status-badge'
import { DetailPage } from '#/shared/components/templates/detail-page'
import { formatDate } from '#/shared/i18n/format'
import { buttonVariants } from '#/shared/ui/button'

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
      status={course.archived_at_unix ? <StatusBadge tone="warning">{m.course_archived()}</StatusBadge> : null}
      primaryAction={
        session ? (
          <LearnerAction course={course} />
        ) : (
          // A guest's "Enrol" signs in first and comes back here (UX-021).
          <RouterLink to="/login" search={{ redirect: `/courses/${courseId}/about` }} className={buttonVariants()}>
            {m.course_enroll()}
          </RouterLink>
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
