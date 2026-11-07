import type { ActivityType } from '#/shared/api/gen/types.gen'
import { activityTypeMeta } from '#/shared/i18n/labels'

/** An activity type's icon in its own ink (DESIGN 3), no tile behind it. The label stays beside it. */
export function ActivityIcon({ type, size = 'md' }: { type: ActivityType; size?: 'sm' | 'md' }) {
  const { icon: Icon, ink } = activityTypeMeta[type]
  return (
    <span className={`grid shrink-0 place-items-center ${size === 'md' ? 'size-6' : 'size-5'}`}>
      <Icon aria-hidden className={`${ink} stroke-[1.75] ${size === 'md' ? 'size-5' : 'size-4'}`} />
    </span>
  )
}
