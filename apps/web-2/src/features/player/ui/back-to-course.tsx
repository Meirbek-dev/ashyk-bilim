import { ArrowLeft } from 'lucide-react'
import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { buttonVariants } from '#/shared/ui/button'

/** The focus top bar's way out: the course page. */
export function BackToCourse({ courseId }: { courseId: CourseId }) {
  return (
    <RouterLink to="/courses/$courseId/about" params={{ courseId }} className={buttonVariants({ variant: 'ghost' })}>
      <ArrowLeft aria-hidden />
      {m.player_back_to_course()}
    </RouterLink>
  )
}
