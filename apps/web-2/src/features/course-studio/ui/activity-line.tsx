import type { ReactNode } from 'react'

import type { Activity } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { activityTypeMeta } from '#/shared/i18n/labels'

type ActivityLineProps = { courseId: string; activity: Activity; status: ReactNode }

/** Name, type and status: narrow, type and status are a line under the name (it keeps the row's width); wide, columns. */
export function ActivityLine({ courseId, activity, status }: ActivityLineProps) {
  return (
    <span className="flex min-w-0 flex-1 basis-40 flex-col wrap-anywhere @3xl:flex-row @3xl:items-baseline @3xl:gap-4">
      <span className="min-w-0 flex-1 text-sm font-medium">
        <Link
          variant="title"
          to="/teach/courses/$courseId/activities/$activityId/edit"
          params={{ courseId, activityId: activity.id }}
        >
          {activity.name}
        </Link>
      </span>
      <span className="flex shrink-0 flex-wrap items-baseline gap-x-2 @3xl:contents">
        <span className="text-xs text-muted-foreground @3xl:w-32 @3xl:text-sm">
          {activityTypeMeta[activity.activity_type].label()}
        </span>
        <span className="@3xl:w-20 @3xl:text-end">{status}</span>
      </span>
    </span>
  )
}
