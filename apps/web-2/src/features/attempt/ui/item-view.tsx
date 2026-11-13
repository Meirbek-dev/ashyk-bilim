import { useEffect, useRef } from 'react'

import { m } from '#/paraglide/messages'
import type { AssessmentId, AssessmentItem, ItemAnswer } from '#/shared/api/gen/types.gen'
import { formatNumber } from '#/shared/i18n/format'

import { ItemAnswerControl } from './item-answer-control'
import { ItemPrompt } from './item-prompt'
import { TitleText } from './title-text'

type ItemViewProps = {
  item: AssessmentItem
  assessmentId: AssessmentId
  number: number
  total: number
  answer: ItemAnswer | undefined
  onChange: (answer: ItemAnswer) => void
  disabled: boolean
}

/**
 * One question, as on an exam paper: its number hanging in the margin (where there is one), points, title, the author's
 * prompt and pictures, and the answer control of its kind.
 */
export function ItemView(props: ItemViewProps) {
  const { item, number, total } = props
  const heading = useRef<HTMLHeadingElement>(null)
  // «Далее», «Назад» or a number in the list keep the focus on that link while the question changes under it, and a
  // screen reader said nothing: the new question (one mount per question) takes the focus. A page load keeps its own.
  useEffect(() => {
    if (document.activeElement !== document.body) heading.current?.focus()
  }, [])
  return (
    <section className="flex flex-col gap-gutter">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground tabular-nums">
          {m.attempt_question_of({ number, total })} · {m.attempt_points({ points: formatNumber(item.max_score) })}
        </p>
        <div className="relative">
          <span
            aria-hidden
            className="absolute end-full top-0 me-6 hidden font-heading text-2xl text-muted-foreground tabular-nums @5xl:block"
          >
            {number}
          </span>
          <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold text-pretty wrap-anywhere outline-none">
            <TitleText text={item.title} />
          </h1>
        </div>
      </header>
      <ItemPrompt item={item} assessmentId={props.assessmentId} number={number} />
      <ItemAnswerControl {...props} />
    </section>
  )
}
