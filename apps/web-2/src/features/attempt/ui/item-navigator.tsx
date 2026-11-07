import { Check } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { AssessmentItem, ItemAnswer } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { Progress } from '#/shared/components/progress'

import { isBlank } from '../model/attempt'
import { ATTEMPT_PATH } from './attempt-frame'
import { TitleText } from './title-text'

type NavigatorProps = {
  items: AssessmentItem[]
  answers: Record<string, ItemAnswer>
  current: number
  onPick: () => void
}

const revealInPanel = (link: HTMLElement | null) => link?.scrollIntoView({ block: 'nearest' })

/**
 * Every question of the attempt as a link (`?item=N`), as the paper's own contents: a hanging number, the title, an
 * "Answered" mark; the current one is marked. The thread over the list counts the answered ones.
 */
export function ItemNavigator({ items, answers, current, onPick }: NavigatorProps) {
  const answered = items.filter(item => !isBlank(answers[item.id], item.body)).length
  const total = items.length
  const count = m.attempt_answered_count({ done: answered, total })
  return (
    <div className="flex flex-col gap-gutter">
      <div className="flex flex-col gap-2">
        <p className="font-heading text-lg font-semibold">{m.attempt_questions_nav()}</p>
        <Progress value={total ? (answered / total) * 100 : 0} aria-label={count} />
        <p className="text-sm text-muted-foreground tabular-nums">{count}</p>
      </div>
      <ol className="flex flex-col gap-0.5">
        {items.map((item, index) => {
          const done = !isBlank(answers[item.id], item.body)
          return (
            <li key={item.id}>
              <Link
                from={ATTEMPT_PATH}
                to="."
                search={search => ({ ...search, item: index + 1 })}
                variant="contents"
                aria-current={index + 1 === current ? 'step' : undefined}
                // «Далее» moves the current question down a 115-row list: keep it in the panel's view.
                ref={index + 1 === current ? revealInPanel : undefined}
                onClick={onPick}
              >
                <span
                  className={`w-6 shrink-0 text-end font-heading text-base tabular-nums ${done ? '' : 'text-muted-foreground'}`}
                >
                  {index + 1}
                </span>
                <span title={item.title} className="line-clamp-2 min-w-0 flex-1 wrap-anywhere">
                  <TitleText text={item.title} />
                </span>
                {done ? (
                  <>
                    <Check aria-hidden className="text-success" />
                    <span className="sr-only">{m.attempt_answered()}</span>
                  </>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
