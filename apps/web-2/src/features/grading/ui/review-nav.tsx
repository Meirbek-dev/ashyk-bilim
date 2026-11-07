import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { Link as RouterLink, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect } from 'react'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/shared/ui/tooltip'

import { nextToGrade, pileKey } from '../model/queue'
import { queueOptions, type Work } from '../queries'
import { PILE_ROUTE, usePile } from './use-pile'
import { ReviewPosition } from './review-position'

const TO = '/teach/courses/$courseId/activities/$activityId/submissions/$submissionId'

/** Previous / next work of the queue with the filters in the URL (B-GRD-10), also on K / J (B-GRD-39). */
export function ReviewNav({ work }: { work: Work }) {
  const { params, search, prev, next } = usePile(work)
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
  // Words beside the arrows from a laptop up: an arrow alone asked an older teacher to guess, and J / K stay for those
  // who know them (the tooltip says so).
  const step = (submissionId: string | null | undefined, label: string, keys: 'J' | 'K', side: 'prev' | 'next') =>
    submissionId ? (
      <Tooltip>
        <TooltipTrigger
          delay={300}
          render={
            <RouterLink
              className={`${buttonVariants({ variant: 'outline' })} max-@3xl:w-control max-@3xl:px-0`}
              to={TO}
              params={{ ...params, submissionId }}
              search={search}
              aria-keyshortcuts={keys}
              aria-label={label}
            />
          }
        >
          {side === 'prev' ? <ChevronLeft aria-hidden data-icon="inline-start" /> : null}
          <span className="hidden @3xl:inline">
            {side === 'prev' ? m.grading_prev_short() : m.grading_next_short()}
          </span>
          {side === 'next' ? <ChevronRight aria-hidden data-icon="inline-end" /> : null}
        </TooltipTrigger>
        <TooltipContent>{m.grading_step_hint({ label, key: keys })}</TooltipContent>
      </Tooltip>
    ) : null
  return (
    <nav aria-label={m.platform_tab_submissions()} className="flex items-center gap-2">
      <ReviewPosition work={work} className="me-2 hidden whitespace-nowrap text-muted-foreground @3xl:inline" />
      {step(prev, m.grading_prev(), 'K', 'prev')}
      {step(next, m.grading_next(), 'J', 'next')}
    </nav>
  )
}

/**
 * After a publish or a return: the next work of the same queue that waits for grading opens (B-GRD-34), so a teacher
 * grades a pile without going back to the list; on the last one the page stays.
 */
export function useAdvance(work: Work): () => void {
  const params = useParams({ from: PILE_ROUTE })
  const search = useSearch({ from: PILE_ROUTE })
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
