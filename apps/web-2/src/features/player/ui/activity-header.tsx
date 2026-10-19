import type { ActivityType } from '#/shared/api/gen/types.gen'
import { ActivityIcon } from '#/shared/components/activity-icon'
import { activityTypeMeta } from '#/shared/i18n/labels'

/**
 * The activity's heading in the player: its type tile and label on one line over the title, so a long title takes
 * the column's full width (on a phone a tile beside it squeezed it into a narrow tower).
 */
export function ActivityHeader({ type, title }: { type: ActivityType; title: string }) {
  return (
    <header className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ActivityIcon type={type} size="sm" />
        {activityTypeMeta[type].label()}
      </p>
      <h1 className="text-2xl font-semibold wrap-anywhere">{title}</h1>
    </header>
  )
}
