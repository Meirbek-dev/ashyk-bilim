'use client';

import { ChevronDown, ChevronUp, Crown, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import GamifiedUserAvatar from '@/components/Objects/GamifiedUserAvatar';
import type { LeaderboardEntry } from '@/types/gamification';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getRankTheme } from '@/lib/gamification';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentUserId?: number;
  userRank?: number | null;
  className?: string;
}

/**
 * Leaderboard with Context-Aware Positioning
 *
 * Improvements:
 * - Shows user's position with surrounding context
 * - Highlights rank changes (↑↓)
 * - Expandable to show full leaderboard
 * - Visual distinction for top 3
 * - "Distance to next rank" indicator
 */
export function Leaderboard({ entries, currentUserId, userRank, className }: LeaderboardProps) {
  const t = useTranslations('DashPage.UserAccountSettings.Gamification');
  const [showFull, setShowFull] = useState(false);

  const userEntry = entries.find((e) => e.user_id === currentUserId);

  let displayEntries, currentUserEntry, rankContext;

  if (!userEntry || !userRank || showFull) {
    displayEntries = entries.slice(0, showFull ? undefined : 10);
    currentUserEntry = userEntry;
    rankContext = null;
  } else {
    // Show top 3 + user's context (±2 ranks)
    const top3 = entries.slice(0, 3);
    const userRankIndex = userRank - 1;

    // Get surrounding context
    const contextStart = Math.max(3, userRankIndex - 2);
    const contextEnd = Math.min(entries.length, userRankIndex + 3);
    const contextEntries = entries.slice(contextStart, contextEnd);

    // Calculate XP to next rank
    const nextRankEntry = entries[userRankIndex - 1];
    const xpToNext = nextRankEntry ? nextRankEntry.total_xp - userEntry.total_xp : 0;

    displayEntries = userRank <= 3 ? top3 : [...top3, ...contextEntries];
    currentUserEntry = userEntry;
    rankContext = {
      rank: userRank,
      xpToNext,
      nextRankUsername: nextRankEntry?.username || null,
    };
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-amber-500" />
          {t('dashboard.leaderboard')}
        </CardTitle>
        {entries.length > 10 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFull(!showFull)}
            className="h-8 text-xs"
          >
            {showFull ? t('leaderboard.showLess') : t('leaderboard.showAll')}
            {showFull ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* User's Rank Context */}
        {rankContext && !showFull && (
          <div className="bg-primary/5 rounded-lg p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('leaderboard.yourPosition')}</span>
              <span className="font-bold">#{rankContext.rank}</span>
            </div>
            {rankContext.xpToNext > 0 && (
              <div className="text-muted-foreground mt-1 text-xs">
                {t('leaderboard.xpToNextRank', {
                  xp: rankContext.xpToNext.toLocaleString(),
                  username: rankContext.nextRankUsername || '',
                })}
              </div>
            )}
          </div>
        )}

        {/* Leaderboard Entries */}
        <ScrollArea className={cn('pr-4', showFull ? 'h-[500px]' : 'h-[400px]')}>
          <div className="space-y-2">
            {displayEntries.map((entry, index) => {
              const rankTheme = getRankTheme(entry.rank);
              const isCurrentUser = entry.user_id === currentUserId;
              const isTop3 = entry.rank <= 3;

              // Show separator between top 3 and context
              const showSeparator = !showFull && index === 3 && userRank && userRank > 3;

              return (
                <div key={entry.user_id}>
                  {showSeparator && (
                    <div className="text-muted-foreground my-3 flex items-center gap-2 text-xs">
                      <div className="bg-border h-px flex-1" />
                      <span>...</span>
                      <div className="bg-border h-px flex-1" />
                    </div>
                  )}

                  <LeaderboardEntryRow
                    entry={entry}
                    isCurrentUser={isCurrentUser}
                    isTop3={isTop3}
                    rankTheme={rankTheme}
                    t={t}
                  />
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

/**
 * Individual Leaderboard Entry Component
 */
function LeaderboardEntryRow({
  entry,
  isCurrentUser,
  isTop3,
  rankTheme,
  t,
}: {
  entry: LeaderboardEntry;
  isCurrentUser: boolean;
  isTop3: boolean;
  rankTheme: ReturnType<typeof getRankTheme>;
  t: any;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-md px-2 py-2 transition-colors',
        isCurrentUser && 'bg-muted ring-1 ring-border',
        !isCurrentUser && 'hover:bg-muted/50',
      )}
    >
      {/* Rank Badge */}
      <div className="flex w-8 shrink-0 items-center justify-center">
        {isTop3 ? (
          <Badge
            variant="secondary"
            className={cn(
              'h-7 w-7 justify-center rounded-full p-0 text-xs font-bold tabular-nums',
              entry.rank === 1 &&
                'border-amber-400/40 bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
              entry.rank === 2 &&
                'border-slate-400/40 bg-slate-50 text-slate-500 dark:bg-slate-800/40 dark:text-slate-400',
              entry.rank === 3 &&
                'border-orange-400/40 bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400',
            )}
          >
            {entry.rank === 1 ? <Crown className="h-3.5 w-3.5" /> : entry.rank}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs font-medium tabular-nums">#{entry.rank}</span>
        )}
      </div>

      {/* Avatar */}
      <GamifiedUserAvatar
        size="md"
        avatar_url={entry.avatar_url || undefined}
        username={entry.username || undefined}
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

      {/* User Info */}
      <div className="min-w-0 flex-1">
        <p className={cn('truncate font-semibold', isCurrentUser && 'text-primary')}>
          {entry.first_name && entry.last_name
            ? [entry.first_name, entry.middle_name, entry.last_name].filter(Boolean).join(' ')
            : entry.username || 'Anonymous'}
          {isCurrentUser && <span className="text-muted-foreground ml-2 text-xs">({t('leaderboard.you')})</span>}
        </p>
        {entry.username && (entry.first_name || entry.last_name) && (
          <p className="text-muted-foreground text-xs">@{entry.username}</p>
        )}
        <p className="text-muted-foreground text-xs">
          {t('leaderboard.levelLabel', { level: entry.level })} •{' '}
          {t('leaderboard.xp', { xp: entry.total_xp.toLocaleString() })}
        </p>
      </div>

      {/* Rank Change Indicator */}
      {entry.rank_change !== undefined && entry.rank_change !== 0 && (
        <div
          className={cn(
            'flex items-center gap-1 text-xs font-semibold',
            entry.rank_change > 0 && 'text-green-500',
            entry.rank_change < 0 && 'text-red-500',
          )}
        >
          {entry.rank_change > 0 && (
            <>
              <TrendingUp className="h-3 w-3" />+{entry.rank_change}
            </>
          )}
          {entry.rank_change < 0 && (
            <>
              <TrendingDown className="h-3 w-3" />
              {entry.rank_change}
            </>
          )}
        </div>
      )}

      {entry.rank_change === 0 && <Minus className="text-muted-foreground h-3 w-3" />}
    </div>
  );
}
