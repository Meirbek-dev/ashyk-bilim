import { Check, Lock } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { ActivityState, CourseId } from '#/shared/api/gen/types.gen'
import { activityTypeMeta } from '#/shared/i18n/labels'
import { Link } from '#/shared/ui/link'

type RowProps = { courseId: CourseId; activity: ActivityState; onPick: () => void }

/** One activity of the contents: type icon, title, the server's mark; a restricted one is not a link. */
export function ContentsRow({ courseId, activity, onPick }: RowProps) {
  const meta = activityTypeMeta[activity.activity_type]
  const Icon = meta.icon
  const label = (
    <>
      <Icon aria-hidden className={meta.ink} />
      <span className="sr-only">{meta.label()}: </span>
      <span className="min-w-0 flex-1 wrap-anywhere">{activity.title}</span>
    </>
  )
  if (activity.blocked_reason)
    return (
      <span className="flex min-h-control items-center gap-3 px-3 text-sm text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">
        {label}
        <Lock aria-hidden />
        <span className="sr-only">{m.player_locked()}</span>
      </span>
    )
  return (
    <Link
      to="/learn/$courseId/$activityId"
      params={{ courseId, activityId: activity.id }}
      variant="nav"
      onClick={onPick}
    >
      {label}
      {activity.complete ? (
        <>
          <Check aria-hidden className="text-success" />
          <span className="sr-only">{m.player_done()}</span>
        </>
      ) : null}
    </Link>
  )
}
