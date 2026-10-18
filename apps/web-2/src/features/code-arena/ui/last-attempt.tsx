import { m } from '#/paraglide/messages'
import type { StudentSubmission } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { StatusBadge } from '#/shared/components/status-badge'

import { ARENA_PATH } from './arena-route'
import { outcome } from './attempt-detail'

type LastAttemptProps = { attempt: StudentSubmission; passed: boolean | null }

/**
 * The newest handed-in attempt at the top of the entry (B-COD-26): what it came to, "passed / not passed" once the
 * grade is out, and its results and code (`?submission=`), so the learner sees the outcome where they act next.
 */
export function LastAttempt({ attempt, passed }: LastAttemptProps) {
  return (
    <div className="flex flex-col items-start gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{m.code_attempt({ number: attempt.attempt_number })}</span>
        {passed === null ? null : (
          <StatusBadge tone={passed ? 'success' : 'destructive'}>
            {passed ? m.code_passed() : m.code_not_passed()}
          </StatusBadge>
        )}
      </div>
      {outcome(attempt).map(line => (
        <p key={line} className="tabular-nums">
          {line}
        </p>
      ))}
      <Link from={ARENA_PATH} to="." search={previous => ({ ...previous, submission: attempt.id })}>
        {m.code_last_details()}
      </Link>
    </div>
  )
}
