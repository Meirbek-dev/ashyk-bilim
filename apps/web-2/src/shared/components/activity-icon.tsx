import type { ActivityType } from '#/shared/api/gen/types.gen'
import { activityTypeMeta } from '#/shared/i18n/labels'

/** An activity type's icon on its own tint (DESIGN 3): rows of deadlines and outlines. The label stays beside it. */
export function ActivityIcon({ type, size = 'md' }: { type: ActivityType; size?: 'sm' | 'md' }) {
  const { icon: Icon, ink, tint } = activityTypeMeta[type]
  return (
    <span className={`grid shrink-0 place-items-center rounded-lg ${tint} ${size === 'md' ? 'size-10' : 'size-7'}`}>
      <Icon aria-hidden className={`${ink} ${size === 'md' ? 'size-5' : 'size-4'}`} />
    </span>
  )
}
