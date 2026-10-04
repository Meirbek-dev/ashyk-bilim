import { m } from '#/paraglide/messages'
import type { AssessmentItem, GradedItem } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatNumber } from '#/shared/i18n/format'

import { answerText, correctText } from '../model/answer-text'

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
          return (
            <li key={entry.item_id} className="flex flex-col gap-1 py-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium wrap-anywhere">
                  {m.attempt_question_number({ number: index + 1 })}
                  {item ? `: ${item.title}` : ''}
                </p>
                {entry.correct === null ? null : (
                  <StatusBadge tone={entry.correct ? 'success' : 'destructive'}>
                    {entry.correct ? m.attempt_correct() : m.attempt_incorrect()}
                  </StatusBadge>
                )}
                <span className="text-muted-foreground tabular-nums">
                  {m.attempt_item_points({ score: formatNumber(entry.score), max: formatNumber(entry.max_score) })}
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
