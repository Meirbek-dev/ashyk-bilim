import { useSuspenseQuery } from '@tanstack/react-query'

import { Flame } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { formatNumber } from '#/shared/i18n/format'
import { Progress } from '#/shared/components/progress'
import { ProgressRing } from '#/shared/components/progress-ring'

import { activeStreak, dailyShare, levelProgress } from '../model/achievements'
import { achievementsOptions } from '../queries'

const card = 'flex flex-col gap-3 rounded-xl border bg-card p-gutter text-card-foreground shadow-xs'

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
    <div className="grid gap-4 @3xl:grid-cols-3">
      <section aria-label={m.achievements_level_title()} className={`${card} flex-row items-center gap-5`}>
        <ProgressRing value={progress.percent} tone="stroke-reward" className="size-24">
          <span aria-hidden className="font-heading text-display font-semibold tabular-nums">
            {profile.level}
          </span>
        </ProgressRing>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-xl font-semibold">{m.achievements_level_title()}</h2>
          <Progress value={progress.percent} aria-label={m.achievements_progress_label()} className="sr-only" />
          <p className="text-sm text-muted-foreground tabular-nums">
            {progress.next === null
              ? m.achievements_max_level()
              : m.achievements_progress_left({ left: formatNumber(progress.left), next: progress.next })}
          </p>
        </div>
      </section>
      <section aria-label={m.achievements_daily_title()} className={card}>
        <h2 className="text-xl font-semibold">{m.achievements_daily_title()}</h2>
        <p aria-hidden className="font-heading text-2xl font-semibold tabular-nums">
          {formatNumber(daily.earned_today)}
        </p>
        {share === null ? null : (
          <Progress value={share} aria-label={m.achievements_daily_title()} className="progress-lg" />
        )}
        <p className="text-sm text-muted-foreground tabular-nums">
          {daily.limit === null
            ? m.achievements_daily_unlimited({ earned: formatNumber(daily.earned_today) })
            : daily.earned_today >= daily.limit
              ? m.achievements_daily_reached({ limit: formatNumber(daily.limit) })
              : m.achievements_daily_of({ earned: formatNumber(daily.earned_today), limit: formatNumber(daily.limit) })}
        </p>
      </section>
      <section aria-label={m.achievements_streaks_title()} className={card}>
        <h2 className="text-xl font-semibold">{m.achievements_streaks_title()}</h2>
        <dl className="grid grid-cols-2 gap-4">
          {streaks.map(streak => (
            <div key={streak.label} className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">{streak.label}</dt>
              <dd className="flex items-center gap-1.5 font-heading text-xl font-semibold tabular-nums">
                <Flame
                  aria-hidden
                  className={`size-5 shrink-0 ${streak.days > 0 ? 'text-reward' : 'text-muted-foreground'}`}
                />
                {m.achievements_days({ count: streak.days })}
              </dd>
              <dd className="text-sm text-muted-foreground tabular-nums">
                {m.achievements_streak_best({ days: m.achievements_days({ count: streak.best }) })}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
