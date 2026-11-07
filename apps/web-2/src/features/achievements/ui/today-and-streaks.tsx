import { useSuspenseQuery } from '@tanstack/react-query'
import { Flame } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Progress } from '#/shared/components/progress'
import { formatNumber } from '#/shared/i18n/format'

import { activeStreak, dailyShare } from '../model/achievements'
import { achievementsOptions } from '../queries'

/** Today's XP against the cap and the two streaks: one ruled line of figures, not three boxes. */
export function TodayAndStreaks() {
  const { data, dataUpdatedAt } = useSuspenseQuery(achievementsOptions())
  const { profile } = data
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
    <div className="grid gap-8 border-y py-7 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] @3xl:gap-0">
      <section aria-label={m.achievements_daily_title()} className="flex flex-col gap-2 @3xl:pr-10">
        <h2 className="text-xl font-semibold">{m.achievements_daily_title()}</h2>
        <p aria-hidden className="font-heading text-3xl font-semibold tabular-nums">
          {formatNumber(daily.earned_today)}
        </p>
        {share === null ? null : <Progress value={share} aria-label={m.achievements_daily_title()} />}
        <p className="text-sm text-muted-foreground tabular-nums">
          {daily.limit === null
            ? m.achievements_daily_unlimited({ earned: formatNumber(daily.earned_today) })
            : daily.earned_today >= daily.limit
              ? m.achievements_daily_reached({ limit: formatNumber(daily.limit) })
              : m.achievements_daily_of({ earned: formatNumber(daily.earned_today), limit: formatNumber(daily.limit) })}
        </p>
      </section>
      <section aria-label={m.achievements_streaks_title()} className="flex flex-col gap-2 @3xl:border-l @3xl:pl-10">
        <h2 className="text-xl font-semibold">{m.achievements_streaks_title()}</h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
          {streaks.map(streak => (
            <div key={streak.label} className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">{streak.label}</dt>
              <dd className="flex items-center gap-2 font-heading text-3xl font-semibold tabular-nums">
                <Flame
                  aria-hidden
                  className={`size-6 shrink-0 ${streak.days > 0 ? 'text-reward' : 'text-muted-foreground'}`}
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
