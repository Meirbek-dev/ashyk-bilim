import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/ui/link'

import { readinessOptions } from '../queries'
import { ReadinessList } from './readiness-list'

/** `overview`: what is missing before publishing, from the server, with the next step. */
export function OverviewPage() {
  const { courseId } = useParams({ from: '/_authed/teach/courses/$courseId/overview' })
  const { data: readiness } = useSuspenseQuery(readinessOptions(courseId))
  return (
    <section className="flex max-w-prose flex-col gap-4">
      <h2 className="text-xl font-semibold">{m.studio_readiness_title()}</h2>
      <ReadinessList courseId={courseId} />
      <div>
        {readiness.ready ? (
          <Link to="/teach/courses/$courseId/publish" params={{ courseId }} variant="outline">
            {m.studio_go_publish()}
          </Link>
        ) : (
          <Link to="/teach/courses/$courseId/content" params={{ courseId }} variant="outline">
            {m.studio_go_content()}
          </Link>
        )}
      </div>
    </section>
  )
}
