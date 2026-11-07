import type { ActivityType } from '#/shared/api/gen/types.gen'
import { ActivityIcon } from '#/shared/components/activity-icon'
import { activityTypeMeta } from '#/shared/i18n/labels'

/**
 * The lesson's title as the player prints it above the text (`player/ui/activity-header.tsx`). Not a heading here: the
 * top bar holds the page's h1, and the name is changed in Settings.
 */
export function ActivityHeading({ type, title }: { type: ActivityType; title: string }) {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ActivityIcon type={type} size="sm" />
        {activityTypeMeta[type].label()}
      </p>
      <p className="font-heading text-3xl font-semibold text-balance wrap-anywhere">{title}</p>
    </div>
  )
}
