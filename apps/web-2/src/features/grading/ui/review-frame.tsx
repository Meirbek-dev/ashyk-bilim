import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { Suspense, useRef, type ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { ListSkeleton } from '#/shared/components/list-skeleton'
import type { SubmissionStatus, FileAttemptStatus, UserSummary } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { formatDateTime } from '#/shared/i18n/format'

import { lastCheck } from '../model/scoring'
import { activityOptions, type Work } from '../queries'
import { scoreText, statusMeta } from './labels'
import { FeedbackDraft } from './feedback-draft'
import type { ReviewAside } from './review-aside'
import { ReviewBack } from './review-back'
import { ReviewNav } from './review-nav'

const ROUTE = '/_authed/teach/courses/$courseId_/activities/$activityId_/submissions/$submissionId'

const scoreLine = (score: number | null) =>
  score === null ? scoreText(null) : m.grading_score_label({ score: scoreText(score) })

type ReviewFrameProps = {
  work: Work
  /** The work under review, as either kind answers it. */
  head: {
    user: UserSummary | null
    attempt_number: number
    status: SubmissionStatus | FileAttemptStatus
    submitted_at_unix: number | null
    started_at_unix: number | null
    graded_at_unix: number | null
    is_late: boolean
    late_penalty_pct: number | null
    final_score: number | null
  }
  aside?: ReviewAside | undefined
  children: ReactNode
}

/**
 * The focus layout of one review (B-GRD-10): back to the queue with its filters, the activity in the top bar, who,
 * which attempt and when (started, handed in, graded), prev / next.
 */
export function ReviewFrame({ work, head, aside, children }: ReviewFrameProps) {
  const { activityId, submissionId } = useParams({ from: ROUTE })
  const { data: activity } = useSuspenseQuery(activityOptions(activityId))
  const name = head.user ? head.user.display_name || head.user.username : ''
  const back = <ReviewBack />
  const status = statusMeta[head.status]
  const check = lastCheck(head)
  const draftTarget = useRef<((text: string) => void) | null>(null)
  const register = (take: (text: string) => void) => {
    draftTarget.current = take
    return () => {
      if (draftTarget.current === take) draftTarget.current = null
    }
  }
  return (
    <FeedbackDraft value={register}>
      <FocusPage
        back={back}
        title={activity.name}
        aside={
          aside
            ? {
                label: aside.label,
                content: (
                  <Suspense fallback={<ListSkeleton />}>
                    <aside.Panel
                      key={submissionId}
                      kind={work.kind}
                      submissionId={submissionId}
                      onFeedbackDraft={text => draftTarget.current?.(text)}
                    />
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
              <span>{m.grading_attempt_label({ number: head.attempt_number })}</span>
              {head.started_at_unix === null ? null : (
                <span>{m.grading_started_at({ date: formatDateTime(head.started_at_unix) })}</span>
              )}
              {head.submitted_at_unix === null ? null : (
                <span>{m.grading_submitted_at({ date: formatDateTime(head.submitted_at_unix) })}</span>
              )}
              {check === null ? null : (
                <span>
                  {(check.returned ? m.grading_returned_at : check.draft ? m.grading_draft_at : m.grading_graded_at)({
                    date: formatDateTime(check.at),
                  })}
                </span>
              )}
              {head.is_late ? <StatusBadge tone="warning">{m.grading_late()}</StatusBadge> : null}
              {head.late_penalty_pct ? (
                <span>{m.grading_penalty({ percent: scoreText(head.late_penalty_pct) })}</span>
              ) : null}
              <span className="tabular-nums">{scoreLine(head.final_score)}</span>
            </div>
            <ReviewNav work={work} />
          </header>
          {children}
        </div>
      </FocusPage>
    </FeedbackDraft>
  )
}
