import { m } from '#/paraglide/messages'
import type { AssessmentItem, GradedItem } from '#/shared/api/gen/types.gen'
import { formatNumber } from '#/shared/i18n/format'

import { answerText } from '../model/answer-text'
import { verdict } from '../model/attempt'
import { BreakdownRow } from './breakdown-row'
import { VERDICT_ORDER, verdicts } from './verdict-labels'

const position = (items: AssessmentItem[], entry: GradedItem) => {
  const at = items.findIndex(item => item.id === entry.item_id)
  return at < 0 ? items.length : at
}

type BreakdownProps = { items: AssessmentItem[]; graded: GradedItem[] }

/**
 * Per-question review (B-ATT-18) as the server redacted it for the policy: points always, right / wrong and the answer
 * key only when they are present. A coded verdict is shown by `correct`; prose is the teacher's own.
 */
export function ResultBreakdown({ items, graded }: BreakdownProps) {
  const rows = graded
    .toSorted((a, b) => position(items, a) - position(items, b))
    .map(entry => {
      const index = items.findIndex(item => item.id === entry.item_id)
      const item = items[index]
      const given = item ? answerText(item.body, entry.user_answer) : ''
      return { entry, index, item, given, verdict: verdict(entry, given !== '') }
    })
  // A long test opens with the tally (B-ATT-26): «Верно: 3 · Неверно: 5 · Без ответа: 92» before 100 rows of review.
  const tally = VERDICT_ORDER.map(key => ({ key, count: rows.filter(row => row.verdict === key).length })).filter(
    part => part.count > 0,
  )
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">{m.attempt_breakdown_heading()}</h2>
      {tally.length > 0 && rows.length > 1 ? (
        <p className="text-sm text-muted-foreground tabular-nums">
          {tally.map(part => `${verdicts[part.key].label()}: ${formatNumber(part.count)}`).join(' · ')}
        </p>
      ) : null}
      <ol className="flex flex-col divide-y border-y">
        {/* In the order the learner saw (a shuffled test numbers its questions per attempt), unknown ones last. */}
        {rows.map(row => (
          <BreakdownRow key={row.entry.item_id} {...row} />
        ))}
      </ol>
    </section>
  )
}
