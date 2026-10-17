import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { DetailPage } from '#/shared/components/templates/detail-page'
import { formatNumber } from '#/shared/i18n/format'

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
      <div className="grid gap-12 pt-4 @4xl:grid-cols-5 @4xl:gap-8">
        <div className="@4xl:col-span-3">
          <LeaderboardSection rank={data.user_rank} />
        </div>
        <div className="@4xl:col-span-2">
          <ActivityFeed />
        </div>
      </div>
    </DetailPage>
  )
}
