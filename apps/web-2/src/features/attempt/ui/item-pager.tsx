import { Link as RouterLink } from '@tanstack/react-router'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { Button } from '#/shared/ui/button'

import { ATTEMPT_PATH } from './attempt-frame'

type PagerProps = { current: number; total: number; onFinish: () => void; disabled: boolean }

/**
 * "Previous" and "Next" question (`?item=N`); on the last one "Submit answers" (the top bar's verb) opens the hand-in confirmation
 * (B-ATT-24), so the way out is where the learner's eyes are, not only in the top bar.
 */
export function ItemPager({ current, total, onFinish, disabled }: PagerProps) {
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
      ) : (
        <Button variant="outline" onClick={onFinish} disabled={disabled}>
          <Check data-icon="inline-start" aria-hidden />
          {m.attempt_finish()}
        </Button>
      )}
    </nav>
  )
}
