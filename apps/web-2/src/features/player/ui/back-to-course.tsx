import { ArrowLeft } from 'lucide-react'
import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { buttonVariants } from '#/shared/components/button-variants'

/** The focus top bar's way out: the course page. */
export function BackToCourse({ courseId }: { courseId: CourseId }) {
  return (
    <RouterLink to="/courses/$courseId/about" params={{ courseId }} className={buttonVariants({ variant: 'ghost' })}>
      <ArrowLeft aria-hidden />
      {/* A phone's bar holds the contents, the search and the panel buttons too: the arrow alone leaves the title room. */}
      <span className="sr-only @3xl:not-sr-only">{m.player_back_to_course()}</span>
    </RouterLink>
  )
}
