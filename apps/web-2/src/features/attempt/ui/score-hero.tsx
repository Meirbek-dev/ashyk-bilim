import { m } from '#/paraglide/messages'
import type { AttemptState, StudentSubmission } from '#/shared/api/gen/types.gen'
import { formatPercent } from '#/shared/i18n/format'

import { resultVerdict } from '../model/attempt'
import { ToneWord } from './tone-word'

type HeroProps = { attempt: StudentSubmission; state: AttemptState; released: boolean }

/** The score large, between two hairlines; with the grade released, "passed / not passed" and the passing score. */
export function ScoreHero({ attempt, state, released }: HeroProps) {
  if (attempt.final_score === null) return null
  const verdict = resultVerdict(attempt, state)
  return (
    <section
      aria-label={m.attempt_score_label()}
      className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-y py-gutter"
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{m.attempt_score_label()}</p>
        <p className="font-heading text-display font-semibold tabular-nums">{formatPercent(attempt.final_score)}</p>
      </div>
      {released ? (
        <div className="flex flex-col gap-1 pb-1.5 @3xl:items-end">
          {verdict === null ? null : (
            <p className="font-heading text-xl">
              <ToneWord tone={verdict === 'passed' ? 'success' : 'destructive'}>
                {verdict === 'passed' ? m.attempt_passed() : m.attempt_not_passed()}
              </ToneWord>
            </p>
          )}
          <p className="text-sm text-muted-foreground tabular-nums">
            {m.attempt_passing_score({ score: formatPercent(state.effective.passing_score) })}
          </p>
        </div>
      ) : null}
    </section>
  )
}
