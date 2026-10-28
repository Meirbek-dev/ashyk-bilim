import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'

import { RemediationGate } from '#/features/ai'
import { lateText } from '#/features/attempt'
import { NextStepLink } from '#/features/player'
import { m } from '#/paraglide/messages'
import type { ActivityId, StudentSubmission } from '#/shared/api/gen/types.gen'
import { ActivityIcon } from '#/shared/components/activity-icon'
import { ErrorAlert } from '#/shared/components/error-alert'
import { SubmitButton } from '#/shared/components/submit-button'
import { formatDateTime, formatNumber } from '#/shared/i18n/format'
import { presentError } from '#/shared/i18n/errors'

import { startOptions, stateOptions } from '../queries'
import { reasonLabels } from './labels'
import { LastAttempt } from './last-attempt'

type EntryProps = {
  courseId: string
  assessmentId: string
  activityId: ActivityId
  /** The newest handed-in attempt, if any: its outcome heads the entry (B-COD-26). */
  last: StudentSubmission | undefined
}

/**
 * No open attempt (B-COD-04): what the learner may still do, from the server's attempt state. "Start" opens a draft;
 * its answer joins the history, which turns this into the editor. A remediation gate shows its session in place.
 * After a hand-in (B-COD-26): its outcome first, then the way on: the next activity (B-PLY-18) leads once it passed,
 * a new attempt leads while it did not.
 */
export function Entry({ courseId, assessmentId, activityId, last }: EntryProps) {
  const { data: state } = useSuspenseQuery(stateOptions(assessmentId))
  const start = useMutation(startOptions(useQueryClient(), courseId, assessmentId))
  const { max_attempts: max, due_at_unix: due, time_limit_seconds: limit, passing_score } = state.effective
  const used = state.attempts_used
  const passed =
    last && last.release_state === 'visible' && last.final_score !== null ? last.final_score >= passing_score : null
  const nextLeads = !state.can_start || passed === true
  const next = last ? (
    <Suspense fallback={null}>
      <NextStepLink courseId={courseId} activityId={activityId} variant={nextLeads ? 'default' : 'outline'} />
    </Suspense>
  ) : null
  return (
    // Where the editor will be: an empty desk in its place, so the page shows what "Start" opens.
    <section
      aria-labelledby="code-entry"
      className="flex min-h-64 flex-col items-start justify-center gap-4 rounded-xl border border-dashed p-gutter"
    >
      <span className="flex items-center gap-3">
        <ActivityIcon type="code_challenge" />
        <h2 id="code-entry" className="text-xl font-semibold">
          {m.code_solution()}
        </h2>
      </span>
      {last ? <LastAttempt attempt={last} passed={passed} /> : null}
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        <li>{max === null ? m.code_attempts_unlimited({ used }) : m.code_attempts_used({ used, max })}</li>
        {due === null ? null : <li>{m.code_due({ date: formatDateTime(due) })}</li>}
        {due === null ? null : <li>{lateText(state.effective)}</li>}
        {limit === null ? null : <li>{m.code_attempt_time({ minutes: formatNumber(Math.ceil(limit / 60)) })}</li>}
      </ul>
      {state.can_start ? (
        <div className="flex flex-wrap items-center gap-2">
          {nextLeads ? next : null}
          <SubmitButton
            variant={nextLeads && last ? 'secondary' : 'default'}
            pending={start.isPending}
            onClick={() => start.mutate({ path: { assessment_id: assessmentId } })}
          >
            {used === 0 ? m.code_start() : m.code_start_again()}
          </SubmitButton>
          {nextLeads ? null : next}
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {state.disabled_reasons.map(reason => (
              <li key={reason}>{reasonLabels[reason]()}</li>
            ))}
          </ul>
          {next}
        </>
      )}
      {state.disabled_reasons.includes('REMEDIATION_REQUIRED') ? (
        <Suspense fallback={null}>
          <RemediationGate activityId={activityId} invalidates={[stateOptions(assessmentId).queryKey]} />
        </Suspense>
      ) : null}
      {start.error ? <ErrorAlert>{presentError(start.error)}</ErrorAlert> : null}
    </section>
  )
}
