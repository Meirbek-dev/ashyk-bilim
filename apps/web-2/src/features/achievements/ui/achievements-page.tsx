import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { formatNumber } from '#/shared/i18n/format'
import { DetailPage } from '#/shared/ui/templates/detail-page'

import { achievementsOptions } from '../queries'
import { ActivityFeed } from './activity-feed'
import { LeaderboardSection } from './leaderboard-section'
import { ProgressSection } from './progress-section'

/** /achievements: level and streaks, the leaderboard, and the latest XP awards (spec 5.4: off the home page). */
export function AchievementsPage() {
  const { data } = useSuspenseQuery(achievementsOptions())
  const { profile } = data
  return (
    <DetailPage
      title={m.platform_nav_achievements()}
      meta={m.achievements_summary({ level: profile.level, xp: formatNumber(profile.total_xp) })}
    >
      <ProgressSection />
      <LeaderboardSection rank={data.user_rank} />
      <ActivityFeed />
    </DetailPage>
  )
}
