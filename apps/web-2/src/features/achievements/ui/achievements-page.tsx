import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { ListPage } from '#/shared/components/templates/list-page'
import { formatNumber } from '#/shared/i18n/format'

import { achievementsOptions } from '../queries'
import { ActivityFeed } from './activity-feed'
import { LeaderboardSection } from './leaderboard-section'
import { TodayAndStreaks } from './today-and-streaks'

/**
 * /achievements: the title with the level and XP in words, the figures as one ruled line (level and its thread, today,
 * the streaks), then the two long lists: the leaderboard and the ledger of XP (spec 5.4: off the home page).
 */
export function AchievementsPage() {
  const { data } = useSuspenseQuery(achievementsOptions())
  const { profile } = data
  return (
    <ListPage
      title={m.platform_nav_achievements()}
      count={m.achievements_summary({ level: profile.level, xp: formatNumber(profile.total_xp) })}
    >
      <TodayAndStreaks />
      <div className="grid gap-12 pt-2 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <LeaderboardSection rank={data.user_rank} />
        <ActivityFeed />
      </div>
    </ListPage>
  )
}
