import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { Link as RouterLink, useParams, useSearch } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/ui/button'

import { neighbours } from '../model/queue'
import { queueOptions, type Work } from '../queries'

const ROUTE = '/_authed/teach/courses/$courseId_/activities/$activityId_/submissions/$submissionId'
const TO = '/teach/courses/$courseId/activities/$activityId/submissions/$submissionId'

// ponytail: walks the pages of the queue loaded so far; the last loaded row has no "next" until "Show more" ran there.
/** Previous / next work of the queue with the filters in the URL (B-GRD-10). */
export function ReviewNav({ work }: { work: Work }) {
  const params = useParams({ from: ROUTE })
  const search = useSearch({ from: ROUTE })
  const { data } = useSuspenseInfiniteQuery(queueOptions(work, search))
  const { prev, next } = neighbours(
    data.pages.flatMap(page => page.items.map(row => row.id)),
    params.submissionId,
  )
  const className = buttonVariants({ variant: 'outline' })
  return (
    <nav aria-label={m.platform_tab_submissions()} className="flex flex-wrap gap-2">
      {prev ? (
        <RouterLink className={className} to={TO} params={{ ...params, submissionId: prev }} search={search}>
          <ChevronLeft aria-hidden data-icon="inline-start" />
          {m.grading_prev()}
        </RouterLink>
      ) : null}
      {next ? (
        <RouterLink className={className} to={TO} params={{ ...params, submissionId: next }} search={search}>
          {m.grading_next()}
          <ChevronRight aria-hidden data-icon="inline-end" />
        </RouterLink>
      ) : null}
    </nav>
  )
}
