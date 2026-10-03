import { Link as RouterLink, useParams, useSearch } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Suspense, type ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import type { SubmissionStatus, FileAttemptStatus, UserSummary } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { formatDateTime } from '#/shared/i18n/format'
import { buttonVariants } from '#/shared/ui/button'

import type { Work } from '../queries'
import { scoreText, statusMeta } from './labels'
import type { ReviewAside } from './review-aside'
import { ReviewNav } from './review-nav'

const ROUTE = '/_authed/teach/courses/$courseId_/activities/$activityId_/submissions/$submissionId'

type ReviewFrameProps = {
  work: Work
  /** The work under review, as either kind answers it. */
  head: {
    user: UserSummary | null
    attempt_number: number
    status: SubmissionStatus | FileAttemptStatus
    submitted_at_unix: number | null
    is_late: boolean
    late_penalty_pct: number | null
    final_score: number | null
  }
  aside?: ReviewAside | undefined
  children: ReactNode
}

/** The focus layout of one review (B-GRD-10): back to the queue with its filters, who and when, prev / next. */
export function ReviewFrame({ work, head, aside, children }: ReviewFrameProps) {
  const { courseId, activityId, submissionId } = useParams({ from: ROUTE })
  const search = useSearch({ from: ROUTE })
  const name = head.user ? head.user.display_name || head.user.username : ''
  const back = (
    <RouterLink
      to="/teach/courses/$courseId/activities/$activityId/submissions"
      params={{ courseId, activityId }}
      search={search}
      className={buttonVariants({ variant: 'ghost' })}
    >
      <ArrowLeft aria-hidden />
      {m.platform_back()}
    </RouterLink>
  )
  const status = statusMeta[head.status]
  return (
    <FocusPage
      back={back}
      title={m.grading_review_title({ name, number: head.attempt_number })}
      aside={
        aside
          ? {
              label: aside.label,
              content: (
                <Suspense>
                  <aside.Panel kind={work.kind} submissionId={submissionId} />
                </Suspense>
              ),
            }
          : undefined
      }
      wide
    >
      <div className="flex flex-col gap-gutter">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold wrap-anywhere">{name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StatusBadge tone={status.tone}>{status.label()}</StatusBadge>
            {head.submitted_at_unix === null ? null : (
              <span>{m.grading_submitted_at({ date: formatDateTime(head.submitted_at_unix) })}</span>
            )}
            {head.is_late ? <StatusBadge tone="warning">{m.grading_late()}</StatusBadge> : null}
            {head.late_penalty_pct ? (
              <span>{m.grading_penalty({ percent: scoreText(head.late_penalty_pct) })}</span>
            ) : null}
            <span className="tabular-nums">{scoreText(head.final_score)}</span>
          </div>
          <ReviewNav work={work} />
        </header>
        {children}
      </div>
    </FocusPage>
  )
}
