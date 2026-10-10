import { useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { AssessmentDetail, ReleaseState, StudentSubmission } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatPercent } from '#/shared/i18n/format'

import { stateOptions } from '../queries'
import { ATTEMPT_PATH, AttemptFrame } from './attempt-frame'
import { statuses } from './attempts-list'
import { ItemComments } from './item-comments'
import { ResultBreakdown } from './result-breakdown'

// Why there is no grade to show yet, by release state; `visible` shows the grade instead.
const waiting = {
  hidden: m.attempt_pending_text,
  awaiting_release: m.attempt_awaiting_text,
  returned_for_revision: m.attempt_returned_text,
  visible: null,
} satisfies Record<ReleaseState, (() => string) | null>

/** A handed-in attempt (B-ATT-18, B-ATT-19): what the release mode lets the learner see, and how it was handed in. */
export function AttemptResult({ assessment, attempt }: { assessment: AssessmentDetail; attempt: StudentSubmission }) {
  const { data: state } = useSuspenseQuery(stateOptions(assessment.id))
  const status = statuses[attempt.status]
  const note = waiting[attempt.release_state]
  const released = attempt.release_state === 'visible' || attempt.release_state === 'returned_for_revision'
  const grading = attempt.grading
  return (
    <AttemptFrame title={assessment.title}>
      <article className="flex flex-col gap-gutter">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">{m.attempt_number({ number: attempt.attempt_number })}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge tone={status.tone}>{status.label()}</StatusBadge>
            {attempt.is_late ? <StatusBadge tone="warning">{m.attempt_late()}</StatusBadge> : null}
          </div>
        </header>
        <ul className="flex flex-col gap-1 text-sm">
          {note ? <li>{note()}</li> : null}
          {attempt.final_score === null ? null : (
            <li className="text-lg font-semibold tabular-nums">
              {m.attempt_score({ score: formatPercent(attempt.final_score) })}
            </li>
          )}
          {released ? (
            <li className="tabular-nums">
              {m.attempt_passing_score({ score: formatPercent(state.effective.passing_score) })}
            </li>
          ) : null}
          {attempt.auto_submit_reason === 'time_expired' ? <li>{m.attempt_auto_time()}</li> : null}
          {attempt.auto_submit_reason === 'integrity_violation' ? <li>{m.attempt_auto_violation()}</li> : null}
          {attempt.late_penalty_pct ? (
            <li>{m.attempt_late_penalty({ percent: formatPercent(attempt.late_penalty_pct) })}</li>
          ) : null}
        </ul>
        {grading?.feedback ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">{m.attempt_feedback_heading()}</h2>
            <Suspense fallback={null}>
              <MarkdownView content={grading.feedback} />
            </Suspense>
          </section>
        ) : null}
        {grading?.items?.length ? <ResultBreakdown items={assessment.items} graded={grading.items} /> : null}
        {released ? (
          <ItemComments
            submissionId={attempt.id}
            items={assessment.items}
            // A comment the breakdown already shows under its question is not repeated.
            shown={(grading?.items ?? []).filter(entry => entry.feedback && !entry.feedback_code).map(e => e.item_id)}
          />
        ) : null}
        <Link from={ATTEMPT_PATH} to="." search={{}}>
          {m.attempt_all_attempts()}
        </Link>
      </article>
    </AttemptFrame>
  )
}
