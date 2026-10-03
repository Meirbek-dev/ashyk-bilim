import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { Attempt } from '#/shared/api/gen/types.gen'
import { formatNumber, formatPercent } from '#/shared/i18n/format'
import { Skeleton } from '#/shared/ui/skeleton'

/**
 * A released grade (B-FSB-07, B-FSB-08): the score that counts, the score before a late penalty, the teacher's
 * feedback and the points per rubric criterion. A returned attempt may carry only feedback.
 */
export function GradeDetails({ attempt }: { attempt: Attempt }) {
  const { final_score: score, raw_score: raw, late_penalty_pct: penalty, feedback } = attempt
  const criteria = attempt.rubric_scores?.criteria ?? []
  return (
    <div className="flex flex-col gap-4">
      {score === null ? null : (
        <div className="flex flex-col gap-1">
          <p className="text-xl font-semibold tabular-nums">{m.submission_score({ score: formatPercent(score) })}</p>
          {penalty > 0 && raw !== null ? (
            <p className="text-sm text-muted-foreground tabular-nums">
              {m.submission_penalty({ raw: formatPercent(raw), percent: formatPercent(penalty) })}
            </p>
          ) : null}
        </div>
      )}
      {feedback ? (
        <section aria-labelledby="submission-feedback" className="flex flex-col gap-2">
          <h3 id="submission-feedback" className="text-lg font-semibold">
            {m.submission_feedback()}
          </h3>
          <Suspense fallback={<Skeleton className="h-4 w-2/3" />}>
            <MarkdownView content={feedback} />
          </Suspense>
        </section>
      ) : null}
      {criteria.length > 0 ? (
        <section aria-labelledby="submission-criteria" className="flex flex-col gap-2">
          <h3 id="submission-criteria" className="text-lg font-semibold">
            {m.submission_rubric_scores()}
          </h3>
          <ul className="flex flex-col divide-y text-sm">
            {criteria.map(criterion => (
              <li key={criterion.criterion_id} className="flex min-h-row items-center justify-between gap-4">
                <span className="wrap-anywhere">{criterion.label}</span>
                <span className="shrink-0 tabular-nums">
                  {m.submission_criterion_score({
                    score: formatNumber(criterion.score),
                    max: formatNumber(criterion.max_score),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
