import { ArrowLeft } from 'lucide-react'
import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/ui/button'

/** Leaves a performance drill-down: back to both lists, the filters kept. */
export function BackLink() {
  return (
    <RouterLink
      className={buttonVariants({ variant: 'ghost' })}
      to="."
      search={prev => ({ ...prev, courseId: undefined, assessmentType: undefined, assessmentId: undefined, page: 1 })}
    >
      <ArrowLeft aria-hidden />
      {m.analytics_back()}
    </RouterLink>
  )
}
