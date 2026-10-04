import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { AssessmentItem, ItemAnswer } from '#/shared/api/gen/types.gen'
import { formatNumber } from '#/shared/i18n/format'

import { ItemAnswerControl } from './item-answer-control'

type ItemViewProps = {
  item: AssessmentItem
  number: number
  total: number
  answer: ItemAnswer | undefined
  onChange: (answer: ItemAnswer) => void
  disabled: boolean
}

/** One question: its number, points, title, the author's prompt (markdown) and the answer control of its kind. */
export function ItemView(props: ItemViewProps) {
  const { item, number, total } = props
  const prompt = item.body.prompt
  return (
    <section className="flex flex-col gap-gutter">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground tabular-nums">
          {m.attempt_question_of({ number, total })} · {m.attempt_points({ points: formatNumber(item.max_score) })}
        </p>
        <h1 className="text-2xl font-semibold wrap-anywhere">{item.title}</h1>
      </header>
      {prompt ? (
        <Suspense fallback={null}>
          <MarkdownView content={prompt} />
        </Suspense>
      ) : null}
      <ItemAnswerControl {...props} />
    </section>
  )
}
