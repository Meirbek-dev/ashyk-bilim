import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { AssessmentItem, GradedItem } from '#/shared/api/gen/types.gen'
import { StatusBadge, type StatusTone } from '#/shared/components/status-badge'
import { formatNumber } from '#/shared/i18n/format'

import { answerText, correctText } from '../model/answer-text'
import { extraPrompt, verdict, type Verdict } from '../model/attempt'

/** Points to hundredths, as the grader rounds them («1,126 из 3» read as noise). */
const round2 = (value: number) => Math.round(value * 100) / 100

const position = (items: AssessmentItem[], entry: GradedItem) => {
  const at = items.findIndex(item => item.id === entry.item_id)
  return at < 0 ? items.length : at
}

const verdicts: Record<Verdict, { label: () => string; tone: StatusTone }> = {
  correct: { label: m.attempt_correct, tone: 'success' },
  partly: { label: m.attempt_partly, tone: 'warning' },
  wrong: { label: m.attempt_incorrect, tone: 'destructive' },
  skipped: { label: m.attempt_verdict_unanswered, tone: 'neutral' },
}

const VERDICT_ORDER: Verdict[] = ['correct', 'partly', 'wrong', 'skipped']

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
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold">{m.attempt_breakdown_heading()}</h2>
      {tally.length > 0 && rows.length > 1 ? (
        <p className="text-sm text-muted-foreground tabular-nums">
          {tally.map(part => `${verdicts[part.key].label()}: ${formatNumber(part.count)}`).join(' · ')}
        </p>
      ) : null}
      <ol className="flex flex-col divide-y">
        {/* In the order the learner saw (a shuffled test numbers its questions per attempt), unknown ones last. */}
        {rows.map(({ entry, index, item, given, verdict: shown }) => {
          // The breakdown keeps points as a share of 100; the learner saw the item's own points («1 балл»).
          const scale = item && entry.max_score > 0 ? item.max_score / entry.max_score : 1
          const prompt = item ? extraPrompt(item) : null
          return (
            <li key={entry.item_id} className="flex flex-col gap-1 py-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium wrap-anywhere">
                  {m.attempt_question_number({ number: index + 1 })}
                  {item ? `: ${item.title}` : ''}
                </p>
                {shown ? <StatusBadge tone={verdicts[shown].tone}>{verdicts[shown].label()}</StatusBadge> : null}
                <span className="text-muted-foreground tabular-nums">
                  {m.attempt_item_points({
                    score: formatNumber(round2(entry.score * scale)),
                    max: formatNumber(round2(entry.max_score * scale)),
                  })}
                </span>
              </div>
              {prompt ? (
                <Suspense fallback={null}>
                  <MarkdownView content={prompt} />
                </Suspense>
              ) : null}
              {/* «Без ответа» in the badge already says it; without a verdict the line does. */}
              {given || !shown ? (
                <p className="wrap-anywhere">
                  {m.attempt_your_answer()}: {given || m.attempt_no_answer()}
                </p>
              ) : null}
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
