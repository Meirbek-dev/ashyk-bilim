import { m } from '#/paraglide/messages'
import type { AssessmentId, AssessmentItem, GradedItem } from '#/shared/api/gen/types.gen'
import { formatNumber } from '#/shared/i18n/format'

import { answerText } from '../model/answer-text'
import { verdict } from '../model/attempt'
import { BreakdownRow } from './breakdown-row'
import { VERDICT_ORDER, verdicts } from './verdict-labels'

const position = (order: readonly string[], entry: GradedItem) => {
  const at = order.indexOf(entry.item_id)
  return at < 0 ? order.length : at
}

type BreakdownProps = {
  assessmentId: AssessmentId
  items: AssessmentItem[]
  graded: GradedItem[]
  /** The attempt's questions in the order shown (a bank's draw: `item_ids`); default: `items`' order. */
  order?: readonly string[]
}

/**
 * Per-question review (B-ATT-18) as the server redacted it for the policy: points always, right / wrong and the answer
 * key only when they are present. A coded verdict is shown by `correct`; prose is the teacher's own. Only the attempt's
 * own questions: a bank's attempt was graded on the ones it drew. An earlier attempt's draw may hold questions the
 * learner cannot read now (the test returns the newest attempt's): their title comes from the grading.
 */
export function ResultBreakdown({ assessmentId, items, graded, order = items.map(item => item.id) }: BreakdownProps) {
  const rows = graded
    .toSorted((a, b) => position(order, a) - position(order, b))
    .map((entry, row) => {
      const at = order.indexOf(entry.item_id)
      const item = items.find(candidate => candidate.id === entry.item_id)
      const given = item ? answerText(item.body, entry.user_answer) : ''
      // Without the question (an earlier draw) its options cannot be named, but an answer was still given.
      const answered = item ? given !== '' : entry.user_answer !== null
      return { entry, number: at < 0 ? row + 1 : at + 1, item, given, verdict: verdict(entry, answered) }
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
          <BreakdownRow key={row.entry.item_id} assessmentId={assessmentId} {...row} />
        ))}
      </ol>
    </section>
  )
}
