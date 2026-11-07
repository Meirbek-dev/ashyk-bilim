import { Link as RouterLink } from '@tanstack/react-router'
import { Check } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'

import type { QueueSearch } from '../route'

const QUEUE = '/teach/courses/$courseId/activities/$activityId/submissions'

/**
 * "Late only" (`?late=true`): a toggle, drawn as the gradebook's «with works to check»: as a tab it read as one more
 * status and, its href being the other state, never showed that it was on.
 */
export function LateToggle({ ids, search }: { ids: { courseId: string; activityId: string }; search: QueueSearch }) {
  return (
    <RouterLink
      to={QUEUE}
      params={ids}
      search={{ ...search, late: search.late ? undefined : true }}
      aria-current={search.late ? 'true' : undefined}
      className={buttonVariants({ variant: search.late ? 'secondary' : 'outline' })}
    >
      {search.late ? <Check aria-hidden data-icon="inline-start" /> : null}
      {m.grading_late_only()}
    </RouterLink>
  )
}
