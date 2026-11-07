import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { AssessmentItem, GradedItem } from '#/shared/api/gen/types.gen'
import { formatNumber } from '#/shared/i18n/format'

import { correctText, ownTitle } from '../model/answer-text'
import { extraPrompt, type Verdict } from '../model/attempt'
import { TitleText } from './title-text'
import { ToneWord } from './tone-word'
import { verdicts } from './verdict-labels'

/** Points to hundredths, as the grader rounds them («1,126 из 3» read as noise). */
const round2 = (value: number) => Math.round(value * 100) / 100

type BreakdownRowProps = {
  entry: GradedItem
  index: number
  item: AssessmentItem | undefined
  given: string
  verdict: Verdict | null
}

/** One reviewed question: number, verdict, points, the learner's answer, the key and the explanation. */
export function BreakdownRow({ entry, index, item, given, verdict: shown }: BreakdownRowProps) {
  // The breakdown keeps points as a share of 100; the learner saw the item's own points («1 балл»).
  const scale = item && entry.max_score > 0 ? item.max_score / entry.max_score : 1
  const prompt = item ? extraPrompt(item) : null
  // A title cut from its own prompt says the same words twice: the prompt stands alone.
  const title = item ? ownTitle(item.title) : null
  const titled = title && !prompt?.startsWith(title.replace(/…$/u, '')) ? title : null
  return (
    <li className="flex flex-col gap-2.5 py-5 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-muted-foreground">{m.attempt_question_number({ number: index + 1 })}</p>
        <p className="flex flex-wrap items-baseline gap-x-3">
          {shown ? <ToneWord tone={verdicts[shown].tone}>{verdicts[shown].label()}</ToneWord> : null}
          <span className="text-muted-foreground tabular-nums">
            {m.attempt_item_points({
              score: formatNumber(round2(entry.score * scale)),
              max: formatNumber(round2(entry.max_score * scale)),
            })}
          </span>
        </p>
      </div>
      {titled ? (
        <p className="font-medium text-pretty wrap-anywhere">
          <TitleText text={titled} />
        </p>
      ) : null}
      {prompt ? (
        <Suspense fallback={null}>
          <MarkdownView content={prompt} />
        </Suspense>
      ) : null}
      {/* «Без ответа» in the badge already says it; without a verdict the line does. */}
      {given || !shown ? (
        <p className="wrap-anywhere">
          <span className="text-muted-foreground">{m.attempt_your_answer()}: </span>
          {given || m.attempt_no_answer()}
        </p>
      ) : null}
      {/* A right answer is its own key: «Правильный ответ: 4» under «Ваш ответ: 4» only repeated it. */}
      {item && entry.correct_answer && shown !== 'correct' ? (
        <p className="wrap-anywhere">
          <span className="text-muted-foreground">{m.attempt_correct_answer()}: </span>
          {correctText(item.body, entry.correct_answer)}
        </p>
      ) : null}
      {/* The author's «why», sent with the answer key only (review_visibility full). */}
      {entry.explanation ? (
        <div className="mt-1 flex flex-col gap-1 border-l-2 ps-4">
          <p className="text-muted-foreground">{m.attempt_explanation()}</p>
          <Suspense fallback={null}>
            <MarkdownView content={entry.explanation} />
          </Suspense>
        </div>
      ) : null}
      {entry.feedback && !entry.feedback_code ? (
        <p className="wrap-anywhere text-muted-foreground">{entry.feedback}</p>
      ) : null}
    </li>
  )
}
