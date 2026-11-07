import { Suspense, useId } from 'react'

import { MarkdownView } from '#/features/markdown'
import { valueLine } from '#/features/player'
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
  // Unique per instance: the history shows earlier attempts' grades on the same page.
  const id = useId()
  const line =
    score === null ? null : valueLine(m.submission_score({ score: formatPercent(score) }), formatPercent(score))
  return (
    <div className="flex flex-col gap-gutter">
      {line === null ? null : (
        // The score large, the words beside it: the one number the learner came back for.
        <div className="flex flex-col gap-1">
          <p className="flex flex-row-reverse flex-wrap items-baseline justify-end gap-x-3 tabular-nums">
            <span className="text-sm text-muted-foreground">{line.label}</span>
            {line.value ? <span className="font-heading text-display font-semibold">{line.value}</span> : null}
          </p>
          {penalty > 0 && raw !== null ? (
            <p className="text-sm text-muted-foreground tabular-nums">
              {m.submission_penalty({ raw: formatPercent(raw), percent: formatPercent(penalty) })}
            </p>
          ) : null}
        </div>
      )}
      {feedback ? (
        <section aria-labelledby={`${id}-feedback`} className="flex flex-col gap-2">
          <h3 id={`${id}-feedback`} className="text-lg font-semibold">
            {m.submission_feedback()}
          </h3>
          <div className="border-l-2 pl-4">
            <Suspense fallback={<Skeleton className="h-4 w-2/3" />}>
              <MarkdownView content={feedback} />
            </Suspense>
          </div>
        </section>
      ) : null}
      {criteria.length > 0 ? (
        <section aria-labelledby={`${id}-criteria`} className="flex flex-col gap-2">
          <h3 id={`${id}-criteria`} className="text-lg font-semibold">
            {m.submission_rubric_scores()}
          </h3>
          <ul className="flex flex-col divide-y border-y text-sm">
            {criteria.map(criterion => (
              <li key={criterion.criterion_id} className="flex items-baseline justify-between gap-4 py-2.5">
                <span className="wrap-anywhere">{criterion.label}</span>
                <span className="shrink-0 font-heading text-base tabular-nums">
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
