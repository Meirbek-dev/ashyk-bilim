import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams, Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'

import { courseStatus } from '../model/course'
import { courseOptions, readinessOptions } from '../queries'
import { CoursePulse } from './course-pulse'
import { ReadinessList } from './readiness-list'

/**
 * `overview`: the course pulse (B-CST-47), then what is missing before publishing, from the server, with the next step;
 * a live course shows only what is still worth improving (its warnings), or nothing (B-CST-05).
 */
export function OverviewPage() {
  const { courseId } = useParams({ from: '/_authed/teach/courses/$courseId/overview' })
  const { data: readiness } = useSuspenseQuery(readinessOptions(courseId))
  const { data: course } = useSuspenseQuery(courseOptions(courseId))
  const live = courseStatus(course) !== 'draft'
  if (live && readiness.blockers.length + readiness.warnings.length === 0)
    return (
      <div className="@container flex flex-col gap-8">
        <CoursePulse courseId={courseId} />
      </div>
    )
  return (
    <div className="@container flex flex-col gap-8">
      <CoursePulse courseId={courseId} />
      <section className="flex max-w-prose flex-col gap-4">
        <h2 className="text-xl font-semibold">{live ? m.studio_readiness_improve() : m.studio_readiness_title()}</h2>
        <ReadinessList courseId={courseId} live={live} />
        <div>
          {live ? null : readiness.ready ? (
            <RouterLink
              to="/teach/courses/$courseId/publish"
              params={{ courseId }}
              className={buttonVariants({ variant: 'outline' })}
            >
              {m.studio_go_publish()}
            </RouterLink>
          ) : (
            <RouterLink
              to="/teach/courses/$courseId/content"
              params={{ courseId }}
              className={buttonVariants({ variant: 'outline' })}
            >
              {m.studio_go_content()}
            </RouterLink>
          )}
        </div>
      </section>
    </div>
  )
}
