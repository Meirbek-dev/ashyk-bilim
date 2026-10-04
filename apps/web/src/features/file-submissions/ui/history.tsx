import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { FileSubmissionId } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDateTime, formatPercent } from '#/shared/i18n/format'

import { historyOptions } from '../queries'
import { attemptStatus } from './labels'

/** Every attempt, newest first (B-FSB-11); the section appears with the first attempt. */
export function History({ taskId }: { taskId: FileSubmissionId }) {
  const { data: attempts } = useSuspenseQuery(historyOptions(taskId))
  if (attempts.length === 0) return null
  return (
    <section aria-labelledby="submission-history" className="flex flex-col gap-2">
      <h2 id="submission-history" className="text-xl font-semibold">
        {m.submission_history()}
      </h2>
      <ul className="flex flex-col divide-y text-sm">
        {attempts.map(attempt => {
          const status = attemptStatus[attempt.status]
          return (
            <li key={attempt.id} className="flex min-h-row flex-wrap items-center gap-x-4 gap-y-1 py-2">
              <span className="font-medium">{m.submission_attempt({ number: attempt.attempt_number })}</span>
              <span className="text-muted-foreground">
                {attempt.submitted_at_unix === null
                  ? m.submission_not_submitted()
                  : formatDateTime(attempt.submitted_at_unix)}
              </span>
              <StatusBadge tone={status.tone}>{status.label()}</StatusBadge>
              {attempt.final_score === null ? null : (
                <span className="tabular-nums">{formatPercent(attempt.final_score)}</span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
