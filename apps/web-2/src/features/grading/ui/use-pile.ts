import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { useParams, useSearch } from '@tanstack/react-router'

import { neighbours } from '../model/queue'
import { queueOptions, type Work } from '../queries'

export const PILE_ROUTE = '/_authed/teach/courses/$courseId_/activities/$activityId_/submissions/$submissionId'

// ponytail: walks the pages of the queue loaded so far; the last loaded row has no "next" until "Show more" ran there.
export function usePile(work: Work) {
  const params = useParams({ from: PILE_ROUTE })
  const search = useSearch({ from: PILE_ROUTE })
  const { data, hasNextPage } = useSuspenseInfiniteQuery(queueOptions(work, search))
  const ids = data.pages.flatMap(page => page.items.map(row => row.id))
  return { params, search, ids, hasNextPage, ...neighbours(ids, params.submissionId) }
}
