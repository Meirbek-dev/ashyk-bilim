'use client'

import { ChevronDown, ChevronUp, Crown, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import GamifiedUserAvatar from '@/components/Objects/GamifiedUserAvatar'
import type { LeaderboardEntry } from '@/types/gamification'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface LeaderboardProps {
  entries: LeaderboardEntry[]
  currentUserId?: number
  userRank?: number | null
  className?: string
}

/**
 * Leaderboard – context-aware positioning
 * Design: no Card wrapper per row; clean divide-y list with rank indicators
 */
export function Leaderboard({ entries, currentUserId, userRank, className }: LeaderboardProps) {
  const t = useTranslations('DashPage.UserAccountSettings.Gamification')
  const [showFull, setShowFull] = useState(false)

  const userEntry = entries.find(e => e.user_id === currentUserId)

  let displayEntries: LeaderboardEntry[],
    rankContext: null | { rank: number; xpToNext: number; nextRankUsername: string | null }

  if (!userEntry || !userRank || showFull) {
    displayEntries = entries.slice(0, showFull ? undefined : 10)
    rankContext = null
  } else {
    const top3 = entries.slice(0, 3)
    const userRankIndex = userRank - 1
    const contextStart = Math.max(3, userRankIndex - 2)
    const contextEnd = Math.min(entries.length, userRankIndex + 3)
    const contextEntries = entries.slice(contextStart, contextEnd)
    const nextRankEntry = entries[userRankIndex - 1]
    const xpToNext = nextRankEntry ? nextRankEntry.total_xp - userEntry.total_xp : 0

    displayEntries = userRank <= 3 ? top3 : [...top3, ...contextEntries]
    rankContext = {
      rank: userRank,
      xpToNext,
      nextRankUsername: nextRankEntry?.username || null,
    }
  }

  return (
    <div className={cn('border-border bg-card rounded-md border', className)}>
      {/* Header */}
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Crown className="text-foreground h-4 w-4" />
          <h3 className="text-sm font-semibold">{t('dashboard.leaderboard')}</h3>
        </div>
        {entries.length > 10 && (
          <Button variant="ghost" size="sm" onClick={() => setShowFull(!showFull)} className="h-7 text-xs">
            {showFull ? t('leaderboard.showLess') : t('leaderboard.showAll')}
            {showFull ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
          </Button>
        )}
      </div>

      {/* Rank context banner */}
      {rankContext && !showFull && (
        <div className="border-border border-b px-4 py-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('leaderboard.yourPosition')}</span>
            <span className="font-semibold tabular-nums">#{rankContext.rank}</span>
          </div>
          {rankContext.xpToNext > 0 && (
            <p className="text-muted-foreground mt-0.5 text-xs">
              {t('leaderboard.xpToNextRank', {
                xp: rankContext.xpToNext.toLocaleString(),
                username: rankContext.nextRankUsername || '',
              })}
            </p>
          )}
        </div>
      )}

      {/* List */}
      <ScrollArea className={cn(showFull ? 'h-[500px]' : 'h-[400px]')}>
        <div className="divide-border divide-y">
          {displayEntries.map((entry, index) => {
            const isCurrentUser = entry.user_id === currentUserId
            const isTop3 = entry.rank <= 3
            const showSeparator = !showFull && index === 3 && userRank && userRank > 3

            return (
              <div key={entry.user_id}>
                {showSeparator && (
                  <div className="text-muted-foreground flex items-center gap-2 px-4 py-1.5 text-xs">
                    <div className="bg-border h-px flex-1" />
                    <span>···</span>
                    <div className="bg-border h-px flex-1" />
                  </div>
                )}
                <LeaderboardRow entry={entry} isCurrentUser={isCurrentUser} isTop3={isTop3} t={t} />
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}

function LeaderboardRow({
  entry,
  isCurrentUser,
  isTop3,
  t,
}: {
  entry: LeaderboardEntry
  isCurrentUser: boolean
  isTop3: boolean
  t: AppTranslator
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 transition-colors',
        isCurrentUser && 'bg-primary/5',
        !isCurrentUser && 'hover:bg-muted/40',
      )}
    >
      {/* Rank indicator */}
      <div className="flex w-7 shrink-0 items-center justify-center">
        {entry.rank === 1 ? (
          <Crown className="text-foreground h-4 w-4" aria-label="1st" />
        ) : isTop3 ? (
          <span
            className={cn(
              'text-xs font-bold tabular-nums',
              entry.rank === 2 ? 'text-muted-foreground' : 'text-muted-foreground',
            )}
          >
            #{entry.rank}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs tabular-nums">#{entry.rank}</span>
        )}
      </div>

      {/* Avatar */}
      <GamifiedUserAvatar
        size="md"
        {...(entry.avatar_url ? { avatar_url: entry.avatar_url } : {})}
        {...(entry.username ? { username: entry.username } : {})}
        userId={entry.user_id}
        showProfilePopup
        showLevelBadge
        gamificationProfile={{
          user_id: entry.user_id,
          level: entry.level,
          total_xp: entry.total_xp,
          xp_to_next_level: 0,
          login_streak: 0,
          learning_streak: 0,
          longest_login_streak: 0,
          longest_learning_streak: 0,
          total_activities_completed: 0,
          total_courses_completed: 0,
          daily_xp_earned: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          preferences: {},
        }}
        levelIndicatorPosition="bottom-right"
        fallbackText={entry.username?.slice(0, 2).toUpperCase() || 'U'}
      />

      {/* User info */}
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', isCurrentUser && 'text-primary')}>
          {entry.first_name && entry.last_name
            ? [entry.first_name, entry.middle_name, entry.last_name].filter(Boolean).join(' ')
            : entry.username || t('leaderboard.anonymous')}
          {isCurrentUser && (
            <span className="text-muted-foreground ml-1.5 text-xs font-normal">({t('leaderboard.you')})</span>
          )}
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">
          {t('leaderboard.levelLabel', { level: entry.level })} ·{' '}
          {t('leaderboard.xp', { xp: entry.total_xp.toLocaleString() })}
        </p>
      </div>

      {/* Rank change */}
      {entry.rank_change !== undefined && entry.rank_change !== 0 && (
        <div
          className={cn(
            'flex items-center gap-0.5 text-xs font-semibold',
            entry.rank_change > 0 && 'text-green-700 dark:text-green-400',
            entry.rank_change < 0 && 'text-destructive',
          )}
        >
          {entry.rank_change > 0 ? (
            <>
              <TrendingUp className="h-3 w-3" />+{entry.rank_change}
            </>
          ) : (
            <>
              <TrendingDown className="h-3 w-3" />
              {entry.rank_change}
            </>
          )}
        </div>
      )}

      {entry.rank_change === 0 && <Minus className="text-muted-foreground h-3 w-3" />}
    </div>
  )
}
