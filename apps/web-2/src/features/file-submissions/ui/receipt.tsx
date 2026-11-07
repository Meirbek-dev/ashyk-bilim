import { m } from '#/paraglide/messages'
import type { Attempt } from '#/shared/api/gen/types.gen'
import { formatDateTime } from '#/shared/i18n/format'

import { AttemptFiles } from './attempt-files'

/**
 * What was handed in and when (B-FSB-06): the time, the attempt, a late mark and the files; then "awaiting review",
 * or, once graded but not released, that the grade comes with the release.
 */
export function Receipt({ attempt }: { attempt: Attempt }) {
  const submitted = attempt.submitted_at_unix
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {submitted === null ? null : (
          <p className="font-heading text-lg font-semibold">
            {m.submission_receipt_title({ date: formatDateTime(submitted) })}
          </p>
        )}
        <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
          <span>{m.submission_attempt({ number: attempt.attempt_number })}</span>
          {attempt.is_late ? <span className="font-medium text-warning">{m.submission_late()}</span> : null}
          {attempt.status === 'submitted' ? (
            <span className="font-medium text-info">{m.submission_awaiting_review()}</span>
          ) : null}
        </p>
        {attempt.status === 'graded' ? <p className="text-muted-foreground">{m.submission_grade_hidden()}</p> : null}
      </div>
      <AttemptFiles files={attempt.files} />
    </div>
  )
}
