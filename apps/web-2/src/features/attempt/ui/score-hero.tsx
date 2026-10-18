import { m } from '#/paraglide/messages'
import type { AttemptState, StudentSubmission } from '#/shared/api/gen/types.gen'
import { ProgressRing } from '#/shared/components/progress-ring'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatPercent } from '#/shared/i18n/format'

import { resultVerdict } from '../model/attempt'

type HeroProps = { attempt: StudentSubmission; state: AttemptState; released: boolean }

/** The score large beside its ring; with the grade released, "passed / not passed" and the passing score. */
export function ScoreHero({ attempt, state, released }: HeroProps) {
  if (attempt.final_score === null) return null
  const verdict = resultVerdict(attempt, state)
  return (
    <section aria-label={m.attempt_score_label()} className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex items-center gap-4">
        <ProgressRing value={attempt.final_score} className="size-16" />
        <div className="flex flex-col">
          <p className="text-sm text-muted-foreground">{m.attempt_score_label()}</p>
          <p className="font-heading text-display font-semibold tabular-nums">{formatPercent(attempt.final_score)}</p>
        </div>
      </div>
      {released ? (
        <div className="flex flex-col items-start gap-1 text-sm">
          {verdict === null ? null : (
            <StatusBadge tone={verdict === 'passed' ? 'success' : 'destructive'}>
              {verdict === 'passed' ? m.attempt_passed() : m.attempt_not_passed()}
            </StatusBadge>
          )}
          <p className="text-muted-foreground tabular-nums">
            {m.attempt_passing_score({ score: formatPercent(state.effective.passing_score) })}
          </p>
        </div>
      ) : null}
    </section>
  )
}
