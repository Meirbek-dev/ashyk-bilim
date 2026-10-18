import { Check } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { ActivityIcon } from '#/shared/components/activity-icon'
import { Link } from '#/shared/components/link'
import { formatDateTime } from '#/shared/i18n/format'
import { activityType, activityTypeMeta } from '#/shared/i18n/labels'

import type { SyllabusActivity } from '../model/course'

/** One activity on the chapter's seam: type icon on the thread, title (the row is the link), type, done mark. */
export function SyllabusRow({ courseId, activity }: { courseId: CourseId; activity: SyllabusActivity }) {
  const type = activityType(activity.type)
  return (
    <li className={`relative border-l-2 py-0.5 ${activity.complete ? 'border-primary' : 'border-dashed border-input'}`}>
      <div
        className={`-ml-4 flex min-h-row items-center gap-3 rounded-lg pr-3 ${activity.available ? 'transition-colors duration-150 hover:bg-accent hover:text-accent-foreground' : ''}`}
      >
        <span className="rounded-lg bg-background">
          <ActivityIcon type={type} size="sm" />
        </span>
        <span className="min-w-0 flex-1 wrap-anywhere">
          {activity.available ? (
            <Link variant="stretched" to="/learn/$courseId/$activityId" params={{ courseId, activityId: activity.id }}>
              {activity.title}
            </Link>
          ) : (
            activity.title
          )}
        </span>
        {activity.opensAt ? (
          <span className="text-sm text-muted-foreground">
            {m.course_activity_opens({ date: formatDateTime(activity.opensAt) })}
          </span>
        ) : null}
        <span className="hidden text-sm text-muted-foreground @lg:inline">{activityTypeMeta[type].label()}</span>
        <span className="grid size-5 shrink-0 place-items-center">
          {activity.complete ? (
            <>
              <Check aria-hidden className="size-5 text-success" />
              <span className="sr-only">{m.course_activity_done()}</span>
            </>
          ) : null}
        </span>
      </div>
    </li>
  )
}
