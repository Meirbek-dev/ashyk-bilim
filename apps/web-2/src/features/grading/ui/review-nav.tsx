import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { Link as RouterLink, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect } from 'react'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { formatNumber } from '#/shared/i18n/format'

import { neighbours, nextToGrade, pileKey } from '../model/queue'
import { queueOptions, type Work } from '../queries'

const ROUTE = '/_authed/teach/courses/$courseId_/activities/$activityId_/submissions/$submissionId'
const TO = '/teach/courses/$courseId/activities/$activityId/submissions/$submissionId'

// ponytail: walks the pages of the queue loaded so far; the last loaded row has no "next" until "Show more" ran there.
/** Previous / next work of the queue with the filters in the URL (B-GRD-10), also on K / J (B-GRD-39). */
export function ReviewNav({ work }: { work: Work }) {
  const params = useParams({ from: ROUTE })
  const search = useSearch({ from: ROUTE })
  const { data, hasNextPage } = useSuspenseInfiniteQuery(queueOptions(work, search))
  const ids = data.pages.flatMap(page => page.items.map(row => row.id))
  const { prev, next } = neighbours(ids, params.submissionId)
  const at = ids.indexOf(params.submissionId)
  const className = buttonVariants({ variant: 'outline' })
  const navigate = useNavigate()
  // A pile is walked from the keyboard too (Gmail/Linear J and K, by key position so any layout works).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = pileKey(event, { prev, next })
      if (target) void navigate({ to: TO, params: { ...params, submissionId: target }, search })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })
  return (
    <nav aria-label={m.platform_tab_submissions()} className="flex flex-wrap items-center gap-2">
      {/* Where in the pile: only when the whole queue is loaded, else the total is not known here. */}
      {at >= 0 && !hasNextPage && ids.length > 1 ? (
        <span className="text-sm text-muted-foreground tabular-nums">
          {m.grading_position({ at: formatNumber(at + 1), total: formatNumber(ids.length) })}
        </span>
      ) : null}
      {prev ? (
        <RouterLink
          className={className}
          to={TO}
          params={{ ...params, submissionId: prev }}
          search={search}
          aria-keyshortcuts="K"
        >
          <ChevronLeft aria-hidden data-icon="inline-start" />
          {m.grading_prev()}
        </RouterLink>
      ) : null}
      {next ? (
        <RouterLink
          className={className}
          to={TO}
          params={{ ...params, submissionId: next }}
          search={search}
          aria-keyshortcuts="J"
        >
          {m.grading_next()}
          <ChevronRight aria-hidden data-icon="inline-end" />
        </RouterLink>
      ) : null}
      {prev || next ? (
        <span className="hidden text-xs text-muted-foreground md:inline">{m.grading_keys_hint()}</span>
      ) : null}
    </nav>
  )
}

/**
 * After a publish or a return: the next work of the same queue that waits for grading opens (B-GRD-34), so a teacher
 * grades a pile without going back to the list; on the last one the page stays.
 */
export function useAdvance(work: Work): () => void {
  const params = useParams({ from: ROUTE })
  const search = useSearch({ from: ROUTE })
  const navigate = useNavigate()
  const { data } = useSuspenseInfiniteQuery(queueOptions(work, search))
  const next = nextToGrade(
    data.pages.flatMap(page => page.items),
    params.submissionId,
  )
  return () => {
    if (next) void navigate({ to: TO, params: { ...params, submissionId: next }, search })
  }
}
