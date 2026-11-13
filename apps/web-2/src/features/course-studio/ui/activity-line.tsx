import type { ReactNode } from 'react'

import type { Activity } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { activityTypeMeta } from '#/shared/i18n/labels'

/** The status column of a wide row, also when the name is being edited (ActivityRow). */
export const STATUS_CELL = '@3xl:order-2 @3xl:w-20 @3xl:shrink-0 @3xl:text-end'

type ActivityLineProps = { courseId: string; activity: Activity; status: ReactNode }

/**
 * Name, type and status. Narrow, type and status are a line under the name (it keeps the row's width). Wide, the three
 * are the row's own cells (`contents`): the type follows the name it describes and takes the room that is left, the
 * status is a column before the row's tools (`order`: the publish button of a draft lesson stands before it, so a row
 * without that button has no hole between its status and its tools).
 */
export function ActivityLine({ courseId, activity, status }: ActivityLineProps) {
  return (
    <span className="flex min-w-0 flex-1 basis-40 flex-col wrap-anywhere @3xl:contents">
      {/* The whole row opens the activity (its tools sit above the link: ActivityRow). */}
      <span className="min-w-0 text-base font-medium">
        <Link
          variant="stretched"
          to="/teach/courses/$courseId/activities/$activityId/edit"
          params={{ courseId, activityId: activity.id }}
        >
          {activity.name}
        </Link>
      </span>
      <span className="flex shrink-0 flex-wrap items-baseline gap-x-2 @3xl:contents">
        <span className="text-sm text-muted-foreground @3xl:ms-2 @3xl:flex-1 @3xl:whitespace-nowrap">
          {activityTypeMeta[activity.activity_type].label()}
        </span>
        <span className={STATUS_CELL}>{status}</span>
      </span>
    </span>
  )
}
