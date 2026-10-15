import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { formatNumber } from '#/shared/i18n/format'
import { Progress } from '#/shared/components/progress'

import { activeStreak, dailyShare, levelProgress } from '../model/achievements'
import { achievementsOptions } from '../queries'

/** Progress to the next level (server numbers only, UX-064), today's XP against the cap, the two streaks. */
export function ProgressSection() {
  const { data, dataUpdatedAt } = useSuspenseQuery(achievementsOptions())
  const { profile } = data
  const progress = levelProgress(profile)
  const daily = data.daily_xp
  const share = dailyShare(daily)
  // Streaks are judged at the moment the profile was read, not at render time.
  const readAt = dataUpdatedAt / 1000
  const streaks = [
    {
      label: m.achievements_streak_login(),
      days: activeStreak(profile.login_streak, profile.last_login_at_unix, readAt),
      best: profile.longest_login_streak,
    },
    {
      label: m.achievements_streak_learning(),
      days: activeStreak(profile.learning_streak, profile.last_learning_at_unix, readAt),
      best: profile.longest_learning_streak,
    },
  ]
  return (
    <>
      <section aria-label={m.achievements_level_title()} className="flex max-w-prose flex-col gap-3">
        <h2 className="text-xl font-semibold">{m.achievements_level_title()}</h2>
        <Progress value={progress.percent} aria-label={m.achievements_progress_label()} />
        <p className="text-sm text-muted-foreground tabular-nums">
          {progress.next === null
            ? m.achievements_max_level()
            : m.achievements_progress_left({ left: formatNumber(progress.left), next: progress.next })}
        </p>
      </section>
      <section aria-label={m.achievements_daily_title()} className="flex max-w-prose flex-col gap-3">
        <h2 className="text-xl font-semibold">{m.achievements_daily_title()}</h2>
        {share === null ? null : <Progress value={share} aria-label={m.achievements_daily_title()} />}
        <p className="text-sm text-muted-foreground tabular-nums">
          {daily.limit === null
            ? m.achievements_daily_unlimited({ earned: formatNumber(daily.earned_today) })
            : daily.earned_today >= daily.limit
              ? m.achievements_daily_reached({ limit: formatNumber(daily.limit) })
              : m.achievements_daily_of({ earned: formatNumber(daily.earned_today), limit: formatNumber(daily.limit) })}
        </p>
      </section>
      <section aria-label={m.achievements_streaks_title()} className="flex max-w-prose flex-col gap-3">
        <h2 className="text-xl font-semibold">{m.achievements_streaks_title()}</h2>
        <dl className="grid gap-4 @md:grid-cols-2">
          {streaks.map(streak => (
            <div key={streak.label} className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">{streak.label}</dt>
              <dd className="text-xl font-semibold tabular-nums">{m.achievements_days({ count: streak.days })}</dd>
              <dd className="text-sm text-muted-foreground tabular-nums">
                {m.achievements_streak_best({ days: m.achievements_days({ count: streak.best }) })}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  )
}
