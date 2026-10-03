import { Link as RouterLink } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/ui/button'

import { ATTEMPT_PATH } from './attempt-frame'

/** "Previous" and "Next" question (`?item=N`); none past either end. */
export function ItemPager({ current, total }: { current: number; total: number }) {
  return (
    <nav aria-label={m.attempt_questions_nav()} className="flex items-center justify-between gap-2 border-t pt-4">
      {current > 1 ? (
        <RouterLink
          from={ATTEMPT_PATH}
          to="."
          search={search => ({ ...search, item: current - 1 })}
          className={buttonVariants({ variant: 'ghost' })}
        >
          <ChevronLeft aria-hidden />
          {m.attempt_prev()}
        </RouterLink>
      ) : (
        <span />
      )}
      {current < total ? (
        <RouterLink
          from={ATTEMPT_PATH}
          to="."
          search={search => ({ ...search, item: current + 1 })}
          className={buttonVariants({ variant: 'outline' })}
        >
          {m.attempt_next()}
          <ChevronRight aria-hidden />
        </RouterLink>
      ) : null}
    </nav>
  )
}
