import { useSuspenseQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { Attempt, FileAttemptId, FileSubmissionId } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDateTime, formatPercent } from '#/shared/i18n/format'

import { opensInHistory } from '../model/task'
import { historyOptions } from '../queries'
import { AttemptFiles } from './attempt-files'
import { GradeDetails } from './grade-details'
import { attemptStatus } from './labels'

/** One attempt's line: number, date (a draft has none), status, released score. */
const row = (attempt: Attempt) => {
  const status = attemptStatus[attempt.status]
  return (
    <>
      <span className="font-medium">{m.submission_attempt({ number: attempt.attempt_number })}</span>
      {attempt.submitted_at_unix === null ? null : (
        <span className="text-muted-foreground">{formatDateTime(attempt.submitted_at_unix)}</span>
      )}
      <StatusBadge tone={status.tone}>{status.label()}</StatusBadge>
      {attempt.final_score === null ? null : <span className="tabular-nums">{formatPercent(attempt.final_score)}</span>}
    </>
  )
}

const ROW = 'flex min-h-row flex-wrap items-center gap-x-4 gap-y-1 py-2'

/**
 * Every attempt, newest first (B-FSB-11), from the second one on: a single attempt is all in the work area above. A
 * draft shows its state instead of a date. An earlier handed-in attempt opens in place to its grade, feedback and
 * files (B-FSB-23): a new draft no longer hides what the teacher said about the last one.
 */
export function History({ taskId, currentId }: { taskId: FileSubmissionId; currentId: FileAttemptId | null }) {
  const { data: attempts } = useSuspenseQuery(historyOptions(taskId))
  if (attempts.length < 2) return null
  return (
    <section aria-labelledby="submission-history" className="flex flex-col gap-2">
      <h2 id="submission-history" className="text-xl font-semibold">
        {m.submission_history()}
      </h2>
      <ul className="flex flex-col divide-y text-sm">
        {attempts.map(attempt =>
          !opensInHistory(attempt, currentId) ? (
            <li key={attempt.id} className={ROW}>
              {row(attempt)}
            </li>
          ) : (
            <li key={attempt.id}>
              <details className="group">
                <summary className={`${ROW} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
                  {row(attempt)}
                  <ChevronDown
                    aria-hidden
                    className="ms-auto size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-180"
                  />
                </summary>
                <div className="flex flex-col gap-4 pb-4">
                  <GradeDetails attempt={attempt} />
                  <AttemptFiles files={attempt.files} />
                </div>
              </details>
            </li>
          ),
        )}
      </ul>
    </section>
  )
}
