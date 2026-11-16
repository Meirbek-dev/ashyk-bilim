import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { sessionOptions } from '#/shared/auth/session'
import { buttonVariants } from '#/shared/components/button-variants'
import { Link } from '#/shared/components/link'

/**
 * The way from an open view into the course: the enrolment the course page runs on `?enroll=1` (B-CRS-16); a guest
 * signs in on the way there. `inline`: a text link inside a sentence (the note), else the card's button.
 */
export function OpenViewEnroll({ courseId, inline = false }: { courseId: CourseId; inline?: boolean }) {
  const { data: session } = useSuspenseQuery(sessionOptions())
  const target = session
    ? ({ to: '/courses/$courseId/about', params: { courseId }, search: { enroll: 1 } } as const)
    : ({ to: '/login', search: { redirect: `/courses/${courseId}/about?enroll=1` } } as const)
  return inline ? (
    <Link {...target}>{m.player_open_enroll()}</Link>
  ) : (
    <RouterLink {...target} className={buttonVariants()}>
      {m.player_open_enroll()}
    </RouterLink>
  )
}
