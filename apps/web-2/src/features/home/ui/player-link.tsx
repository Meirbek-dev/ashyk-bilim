import type { ReactNode } from 'react'

import type { ActivityId, CourseId } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'

type PlayerLinkProps = { courseId: CourseId; activityId: ActivityId; children: ReactNode }

/** A row's activity title as the way into the player: the whole row is the tap target (a phone's thumb). */
export function PlayerLink({ courseId, activityId, children }: PlayerLinkProps) {
  return (
    <h3 className="text-base font-medium wrap-anywhere">
      <Link variant="stretched" to="/learn/$courseId/$activityId" params={{ courseId, activityId }}>
        {children}
      </Link>
    </h3>
  )
}
