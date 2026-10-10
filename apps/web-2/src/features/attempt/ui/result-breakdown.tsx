import { m } from '#/paraglide/messages'
import type { AssessmentItem, GradedItem } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatNumber } from '#/shared/i18n/format'

import { answerText, correctText } from '../model/answer-text'

/** Points to hundredths, as the grader rounds them («1,126 из 3» read as noise). */
const round2 = (value: number) => Math.round(value * 100) / 100

type BreakdownProps = { items: AssessmentItem[]; graded: GradedItem[] }

/**
 * Per-question review (B-ATT-18) as the server redacted it for the policy: points always, right / wrong and the answer
 * key only when they are present. A coded verdict is shown by `correct`; prose is the teacher's own.
 */
export function ResultBreakdown({ items, graded }: BreakdownProps) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold">{m.attempt_breakdown_heading()}</h2>
      <ol className="flex flex-col divide-y">
        {graded.map(entry => {
          const index = items.findIndex(item => item.id === entry.item_id)
          const item = items[index]
          const given = item ? answerText(item.body, entry.user_answer) : ''
          // The breakdown keeps points as a share of 100; the learner saw the item's own points («1 балл»).
          const scale = item && entry.max_score > 0 ? item.max_score / entry.max_score : 1
          return (
            <li key={entry.item_id} className="flex flex-col gap-1 py-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium wrap-anywhere">
                  {m.attempt_question_number({ number: index + 1 })}
                  {item ? `: ${item.title}` : ''}
                </p>
                {entry.correct === null ? null : (
                  <StatusBadge tone={entry.correct ? 'success' : entry.score > 0 ? 'warning' : 'destructive'}>
                    {entry.correct ? m.attempt_correct() : entry.score > 0 ? m.attempt_partly() : m.attempt_incorrect()}
                  </StatusBadge>
                )}
                <span className="text-muted-foreground tabular-nums">
                  {m.attempt_item_points({
                    score: formatNumber(round2(entry.score * scale)),
                    max: formatNumber(round2(entry.max_score * scale)),
                  })}
                </span>
              </div>
              <p className="wrap-anywhere">
                {m.attempt_your_answer()}: {given || m.attempt_no_answer()}
              </p>
              {item && entry.correct_answer ? (
                <p className="wrap-anywhere">
                  {m.attempt_correct_answer()}: {correctText(item.body, entry.correct_answer)}
                </p>
              ) : null}
              {entry.feedback && !entry.feedback_code ? (
                <p className="wrap-anywhere text-muted-foreground">{entry.feedback}</p>
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
