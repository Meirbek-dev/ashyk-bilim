import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'

/** Why the work cannot go on, and the way to the teacher about it (the course's discussions). */
export function AskTeacherNote({ courseId, children }: { courseId: CourseId; children: ReactNode }) {
  return (
    <p className="max-w-prose text-sm text-muted-foreground">
      {children}{' '}
      <Link to="/courses/$courseId/discussions" params={{ courseId }}>
        {m.player_ask_teacher()}
      </Link>
    </p>
  )
}
