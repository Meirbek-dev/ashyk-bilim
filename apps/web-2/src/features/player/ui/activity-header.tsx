import type { ActivityType } from '#/shared/api/gen/types.gen'
import { ActivityIcon } from '#/shared/components/activity-icon'
import { activityTypeMeta } from '#/shared/i18n/labels'

/** The activity's heading in the player: its type tile and label over the title. */
export function ActivityHeader({ type, title }: { type: ActivityType; title: string }) {
  return (
    <header className="flex items-center gap-3">
      <ActivityIcon type={type} />
      <div className="flex min-w-0 flex-col">
        <p className="text-sm text-muted-foreground">{activityTypeMeta[type].label()}</p>
        <h1 className="text-2xl font-semibold wrap-anywhere">{title}</h1>
      </div>
    </header>
  )
}
