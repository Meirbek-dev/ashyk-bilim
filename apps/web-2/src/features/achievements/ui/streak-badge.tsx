import { useSuspenseQuery } from '@tanstack/react-query'
import { Flame } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { ProgressRing } from '#/shared/components/progress-ring'
import { formatNumber } from '#/shared/i18n/format'

import { homeStreak, levelProgress } from '../model/achievements'
import { achievementsOptions } from '../queries'

/**
 * The /home pills (spec 5.4): the level with its ring and total XP, then the live learning streak; both open
 * /achievements. The route loader ensures achievementsOptions(). Nothing when the learner hid gamification.
 */
export function StreakBadge() {
  const { data, dataUpdatedAt } = useSuspenseQuery(achievementsOptions())
  const { profile } = data
  if (profile.settings.display.show_gamification === false) return null
  const days = homeStreak(profile, dataUpdatedAt / 1000)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link to="/achievements" variant="pill">
        <ProgressRing value={levelProgress(profile).percent} tone="stroke-reward" className="size-8">
          <span aria-hidden className="font-heading text-xs font-semibold tabular-nums">
            {profile.level}
          </span>
        </ProgressRing>
        <span className="tabular-nums">
          {m.achievements_summary({ level: profile.level, xp: formatNumber(profile.total_xp) })}
        </span>
      </Link>
      {days === null ? null : (
        <Link to="/achievements" variant="pill">
          <Flame aria-hidden className="text-reward" />
          {m.achievements_streak_badge({ days: m.achievements_days({ count: days }) })}
        </Link>
      )}
    </div>
  )
}
