import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/ui/link'

import { homeStreak } from '../model/achievements'
import { achievementsOptions } from '../queries'

/** The one streak line of /home (spec 5.4); the route loader ensures achievementsOptions(). Nothing without a streak. */
export function StreakBadge() {
  const { data, dataUpdatedAt } = useSuspenseQuery(achievementsOptions())
  const days = homeStreak(data.profile, dataUpdatedAt / 1000)
  if (days === null) return null
  return (
    <p className="text-sm">
      <Link to="/achievements">{m.achievements_streak_badge({ days: m.achievements_days({ count: days }) })}</Link>
    </p>
  )
}
