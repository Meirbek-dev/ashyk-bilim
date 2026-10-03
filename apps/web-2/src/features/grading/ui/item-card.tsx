import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import type { AssessmentItem, GradedItem, ItemAnswer } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'

import { AnswerView } from './answer-view'
import { kindLabels, verdictText } from './labels'

type ItemCardProps = {
  item: AssessmentItem
  answer: ItemAnswer | undefined
  graded: GradedItem | undefined
  /** The grader's fields for this item. */
  children: ReactNode
}

/** One question of the work (B-GRD-11): wording, the learner's answer, the key and the auto-grader's verdict. */
export function ItemCard({ item, answer, graded, children }: ItemCardProps) {
  const verdict = graded ? verdictText(graded) : null
  const tone = graded?.correct === true ? 'success' : graded?.correct === false ? 'destructive' : 'neutral'
  const prompt = 'prompt' in item.body ? item.body.prompt : undefined
  return (
    <li className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold wrap-anywhere">
          {m.grading_item_title({ number: item.position, title: item.title })}
        </h3>
        <p className="text-sm text-muted-foreground">{kindLabels[item.kind]()}</p>
        {prompt ? <p className="wrap-anywhere whitespace-pre-wrap">{prompt}</p> : null}
      </div>
      <AnswerView
        item={item}
        answer={answer ?? graded?.user_answer ?? undefined}
        answerKey={graded?.correct_answer ?? null}
      />
      {verdict || graded?.needs_manual_review ? (
        <div className="flex flex-wrap gap-2">
          {verdict ? <StatusBadge tone={tone}>{verdict}</StatusBadge> : null}
          {graded?.needs_manual_review ? <StatusBadge tone="warning">{m.grading_needs_review()}</StatusBadge> : null}
        </div>
      ) : null}
      {children}
    </li>
  )
}
