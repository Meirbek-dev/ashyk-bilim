import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { DetailPage } from '#/shared/components/templates/detail-page'
import { formatNumber } from '#/shared/i18n/format'

import { achievementsOptions } from '../queries'
import { ActivityFeed } from './activity-feed'
import { LeaderboardSection } from './leaderboard-section'
import { LevelBlock } from './progress-section'
import { LevelThread } from './level-thread'
import { TodayAndStreaks } from './today-and-streaks'

/**
 * /achievements: the learner's level as a solid block with the thread to the next one, today and the streaks,
 * then the two long lists: the leaderboard and the ledger of XP (spec 5.4: off the home page).
 */
export function AchievementsPage() {
  const { data } = useSuspenseQuery(achievementsOptions())
  const { profile } = data
  return (
    <DetailPage
      cover={<LevelBlock level={profile.level} />}
      title={m.platform_nav_achievements()}
      meta={m.achievements_summary({ level: profile.level, xp: formatNumber(profile.total_xp) })}
      primaryAction={<LevelThread />}
    >
      <TodayAndStreaks />
      <div className="grid gap-12 pt-4 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @4xl:gap-14">
        <LeaderboardSection rank={data.user_rank} />
        <ActivityFeed />
      </div>
    </DetailPage>
  )
}
