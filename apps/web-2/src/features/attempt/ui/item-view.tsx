import { Suspense, useEffect, useRef } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { AssessmentItem, ItemAnswer } from '#/shared/api/gen/types.gen'
import { formatNumber } from '#/shared/i18n/format'

import { extraPrompt } from '../model/attempt'
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
  const prompt = extraPrompt(item)
  const heading = useRef<HTMLHeadingElement>(null)
  // «Далее», «Назад» or a number in the list keep the focus on that link while the question changes under it, and a
  // screen reader said nothing: the new question (one mount per question) takes the focus. A page load keeps its own.
  useEffect(() => {
    if (document.activeElement !== document.body) heading.current?.focus()
  }, [])
  return (
    <section className="flex flex-col gap-gutter">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground tabular-nums">
          {m.attempt_question_of({ number, total })} · {m.attempt_points({ points: formatNumber(item.max_score) })}
        </p>
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold wrap-anywhere outline-none">
          {item.title}
        </h1>
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
