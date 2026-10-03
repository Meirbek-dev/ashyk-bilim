import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { ErrorAlert } from '#/shared/components/error-alert'
import { formatDateTime, formatNumber } from '#/shared/i18n/format'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'

import { startOptions, stateOptions } from '../queries'
import { reasonLabels } from './labels'

/**
 * No open attempt (B-COD-04): what the learner may still do, from the server's attempt state. "Start" opens a draft;
 * its answer joins the history, which turns this into the editor.
 */
export function Entry({ courseId, assessmentId }: { courseId: string; assessmentId: string }) {
  const { data: state } = useSuspenseQuery(stateOptions(assessmentId))
  const start = useMutation(startOptions(useQueryClient(), courseId, assessmentId))
  const { max_attempts: max, due_at_unix: due, time_limit_seconds: limit } = state.effective
  const used = state.attempts_used
  return (
    <section aria-labelledby="code-entry" className="flex max-w-prose flex-col gap-4">
      <h2 id="code-entry" className="text-xl font-semibold">
        {m.code_solution()}
      </h2>
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        <li>{max === null ? m.code_attempts_unlimited({ used }) : m.code_attempts_used({ used, max })}</li>
        {due === null ? null : <li>{m.code_due({ date: formatDateTime(due) })}</li>}
        {limit === null ? null : <li>{m.code_attempt_time({ minutes: formatNumber(Math.ceil(limit / 60)) })}</li>}
      </ul>
      {state.can_start ? (
        <div>
          <Button disabled={start.isPending} onClick={() => start.mutate({ path: { assessment_id: assessmentId } })}>
            {start.isPending ? <Spinner data-icon="inline-start" /> : null}
            {used === 0 ? m.code_start() : m.code_start_again()}
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {state.disabled_reasons.map(reason => (
            <li key={reason}>{reasonLabels[reason]()}</li>
          ))}
        </ul>
      )}
      {start.error ? <ErrorAlert>{presentError(start.error)}</ErrorAlert> : null}
    </section>
  )
}
