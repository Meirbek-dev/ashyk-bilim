import { Check } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { AssessmentItem, ItemAnswer } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { ProgressRing } from '#/shared/components/progress-ring'

import { isBlank } from '../model/attempt'
import { ATTEMPT_PATH } from './attempt-frame'

type NavigatorProps = {
  items: AssessmentItem[]
  answers: Record<string, ItemAnswer>
  current: number
  onPick: () => void
}

const revealInPanel = (link: HTMLElement | null) => link?.scrollIntoView({ block: 'nearest' })

/**
 * Every question of the attempt as a link (`?item=N`): number tile, title, "Answered" mark; the current one is marked.
 * A ring over the list counts the answered ones.
 */
export function ItemNavigator({ items, answers, current, onPick }: NavigatorProps) {
  const answered = items.filter(item => !isBlank(answers[item.id], item.body)).length
  const total = items.length
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <ProgressRing value={total ? (answered / total) * 100 : 0} className="size-12">
          <span aria-hidden className="font-heading text-sm font-semibold tabular-nums">
            {answered}
          </span>
        </ProgressRing>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-heading font-semibold">{m.attempt_questions_nav()}</p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {m.attempt_answered_count({ done: answered, total })}
          </p>
        </div>
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
                variant="nav"
                aria-current={index + 1 === current ? 'step' : undefined}
                // «Далее» moves the current question down a 115-row list: keep it in the panel's view.
                ref={index + 1 === current ? revealInPanel : undefined}
                onClick={onPick}
              >
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-lg border font-heading text-xs tabular-nums ${done ? 'border-success/30 bg-success/10 text-success' : 'bg-card'}`}
                >
                  {index + 1}
                </span>
                <span title={item.title} className="line-clamp-2 min-w-0 flex-1 wrap-anywhere">
                  {item.title}
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
