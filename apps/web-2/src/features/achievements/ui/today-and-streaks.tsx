import { useSuspenseQuery } from '@tanstack/react-query'
import { Flame } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Progress } from '#/shared/components/progress'
import { formatNumber } from '#/shared/i18n/format'

import { activeStreak, dailyShare } from '../model/achievements'
import { achievementsOptions } from '../queries'
import { FigureLabel, figureCell, figureNote, figureValue } from './figure-label'
import { LevelThread } from './level-thread'

/**
 * The page's figures as one ruled line, not boxes: the level with its thread, today's XP against the cap and the two
 * streaks. Four equal cells from @4xl, two by two below it.
 */
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
    <div className="grid grid-cols-2 gap-x-8 gap-y-8 border-y py-6 @md:gap-x-10 @4xl:grid-cols-4">
      <LevelThread />
      <section aria-label={m.achievements_daily_title()} className={figureCell}>
        <FigureLabel>{m.achievements_daily_title()}</FigureLabel>
        <p aria-hidden className={figureValue}>
          {formatNumber(daily.earned_today)}
        </p>
        {share === null ? null : <Progress value={share} aria-label={m.achievements_daily_title()} />}
        <p className={figureNote}>
          {daily.limit === null
            ? m.achievements_daily_unlimited({ earned: formatNumber(daily.earned_today) })
            : daily.earned_today >= daily.limit
              ? m.achievements_daily_reached({ limit: formatNumber(daily.limit) })
              : m.achievements_daily_of({ earned: formatNumber(daily.earned_today), limit: formatNumber(daily.limit) })}
        </p>
      </section>
      <section aria-label={m.achievements_streaks_title()} className="col-span-2">
        <h2 className="sr-only">{m.achievements_streaks_title()}</h2>
        <dl className="grid h-full grid-cols-2 gap-x-8 @md:gap-x-10">
          {streaks.map(streak => (
            <div key={streak.label} className={figureCell}>
              <dt className="text-sm text-muted-foreground">{streak.label}</dt>
              <dd className={`flex items-center gap-2 ${figureValue}`}>
                <Flame
                  aria-hidden
                  className={`size-6 shrink-0 ${streak.days > 0 ? 'text-reward' : 'text-muted-foreground'}`}
                />
                {m.achievements_days({ count: streak.days })}
              </dd>
              <dd className={figureNote}>
                {m.achievements_streak_best({ days: m.achievements_days({ count: streak.best }) })}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
