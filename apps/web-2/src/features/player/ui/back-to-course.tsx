import { ArrowLeft } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/ui/link'

/** The focus top bar's way out: the course page. */
export function BackToCourse({ courseId }: { courseId: CourseId }) {
  return (
    <Link to="/courses/$courseId/about" params={{ courseId }} variant="ghost">
      <ArrowLeft aria-hidden />
      {m.player_back_to_course()}
    </Link>
  )
}
