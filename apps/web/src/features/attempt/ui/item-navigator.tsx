import { Check } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { AssessmentItem, ItemAnswer } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'

import { isBlank } from '../model/attempt'
import { ATTEMPT_PATH } from './attempt-frame'

type NavigatorProps = {
  items: AssessmentItem[]
  answers: Record<string, ItemAnswer>
  current: number
  onPick: () => void
}

/** Every question of the attempt as a link (`?item=N`): number, title, "Answered" mark; the current one is marked. */
export function ItemNavigator({ items, answers, current, onPick }: NavigatorProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="px-3 text-sm font-medium">{m.attempt_questions_nav()}</p>
      <ol className="flex flex-col">
        {items.map((item, index) => (
          <li key={item.id}>
            <Link
              from={ATTEMPT_PATH}
              to="."
              search={search => ({ ...search, item: index + 1 })}
              variant="nav"
              aria-current={index + 1 === current ? 'step' : undefined}
              onClick={onPick}
            >
              <span className="w-6 shrink-0 tabular-nums">{index + 1}</span>
              <span className="min-w-0 flex-1 wrap-anywhere">{item.title}</span>
              {isBlank(answers[item.id]) ? null : (
                <>
                  <Check aria-hidden className="size-4 shrink-0 text-success" />
                  <span className="sr-only">{m.attempt_answered()}</span>
                </>
              )}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
