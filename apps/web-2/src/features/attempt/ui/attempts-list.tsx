import { m } from '#/paraglide/messages'
import type { AttemptState, StudentSubmission, SubmissionStatus } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import type { StatusTone } from '#/shared/components/status-badge'
import { formatPercent } from '#/shared/i18n/format'

import { resultVerdict } from '../model/attempt'
import { ATTEMPT_PATH } from './attempt-frame'
import { ToneWord } from './tone-word'

export const statuses = {
  draft: { label: m.attempt_status_draft, tone: 'warning' },
  pending: { label: m.attempt_status_pending, tone: 'info' },
  graded: { label: m.attempt_status_graded, tone: 'info' },
  published: { label: m.attempt_status_published, tone: 'success' },
  returned: { label: m.attempt_status_returned, tone: 'warning' },
} satisfies Record<SubmissionStatus, { label: () => string; tone: StatusTone }>

// A released grade says passed or not against the passing score (B-ATT-05), like the result page does.
const verdicts = {
  passed: { label: m.attempt_passed, tone: 'success' },
  not_passed: { label: m.attempt_not_passed, tone: 'destructive' },
} satisfies Record<'passed' | 'not_passed', { label: () => string; tone: StatusTone }>

/** The learner's attempts, newest first (B-ATT-05): number, verdict or status, released score, a link to each. */
export function AttemptsList({
  attempts,
  state,
}: {
  attempts: StudentSubmission[]
  state: Pick<AttemptState, 'effective'>
}) {
  const handedIn = attempts.filter(attempt => attempt.status !== 'draft')
  if (!handedIn.length) return null
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">{m.attempt_history_heading()}</h2>
      <ul className="flex flex-col divide-y border-y">
        {handedIn.map(attempt => {
          const verdict = resultVerdict(attempt, state)
          const status = verdict ? verdicts[verdict] : statuses[attempt.status]
          return (
            <li key={attempt.id} className="flex min-h-row flex-wrap items-baseline gap-x-3 gap-y-1 py-3 text-sm">
              <Link from={ATTEMPT_PATH} to="." search={{ attempt: attempt.id }}>
                {m.attempt_number({ number: attempt.attempt_number })}
              </Link>
              <ToneWord tone={status.tone}>{status.label()}</ToneWord>
              {attempt.final_score === null ? null : (
                <span className="ms-auto font-heading text-lg tabular-nums">{formatPercent(attempt.final_score)}</span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
