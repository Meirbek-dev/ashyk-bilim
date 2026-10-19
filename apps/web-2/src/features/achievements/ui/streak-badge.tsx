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
  const summary = m.achievements_summary({ level: profile.level, xp: formatNumber(profile.total_xp) })
  const streak = days === null ? null : m.achievements_days({ count: days })
  // On a phone the two pills share one row: the ring already shows the level and the flame the streak, so the text
  // shortens to «200 XP» and «1 день» (the full wording stays, read out, as the link's name).
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link to="/achievements" variant="pill">
        <ProgressRing value={levelProgress(profile).percent} tone="stroke-reward" className="size-8">
          <span aria-hidden className="font-heading text-xs font-semibold tabular-nums">
            {profile.level}
          </span>
        </ProgressRing>
        <span className="tabular-nums">
          <span aria-hidden className="@md:hidden">
            {m.achievements_xp({ xp: formatNumber(profile.total_xp) })}
          </span>
          <span className="sr-only @md:not-sr-only">{summary}</span>
        </span>
      </Link>
      {streak === null ? null : (
        <Link to="/achievements" variant="pill">
          <Flame aria-hidden className="text-reward" />
          <span aria-hidden className="@md:hidden">
            {streak}
          </span>
          <span className="sr-only @md:not-sr-only">{m.achievements_streak_badge({ days: streak })}</span>
        </Link>
      )}
    </div>
  )
}
