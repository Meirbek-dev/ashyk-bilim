'use client';

import { useSession } from '@/hooks/useSession';
import GamifiedUserAvatar from '@/components/Objects/GamifiedUserAvatar';
import { Calendar, Flame, TrendingUp, Trophy, Zap } from 'lucide-react';
import { GlowingLevelBadge, getLevelInfo } from '@/lib/gamification';
import type { UserGamificationProfile } from '@/types/gamification';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface HeroSectionProps {
  profile: UserGamificationProfile;
  userRank?: number | null;
  className?: string;
}

/**
 * Unified Hero Section - Consolidates profile + quick stats
 *
 * Key improvements:
 * - Single focused view with avatar, level, and progress
 * - Visual daily XP progress with cap indicator
 * - Prominent streak display with animation
 * - Next milestone preview
 */
export function HeroSection({ profile, userRank, className }: HeroSectionProps) {
  const t = useTranslations('DashPage.UserAccountSettings.Gamification');
  const locale = useLocale();
  const { user: viewer } = useSession();
  const numberFormatter = new Intl.NumberFormat(locale);
  const formatNumber = (value: number) => numberFormatter.format(value);

  const xpToNext = Math.max(0, profile.xp_to_next_level || 0);
  const currentLevelXp = profile.xp_in_current_level || 0;
  const xpProgress = xpToNext > 0 ? (currentLevelXp / (currentLevelXp + xpToNext)) * 100 : 0;

  // Daily XP progress (out of cap - hardcoded for now, will be added to backend)
  const dailyCap = 500;
  const dailyEarned = profile.daily_xp_earned || 0;
  const dailyXpProgress = Math.min((dailyEarned / dailyCap) * 100, 100);

  // Next milestone
  const nextMilestone = [5, 10, 15, 25, 50, 100].find((l) => l > profile.level);

  // Streak status
  const streakStatus = {
    login: profile.login_streak || 0,
    learning: profile.learning_streak || 0,
    max: Math.max(profile.login_streak || 0, profile.learning_streak || 0),
  };

  // Get level info
  const levelInfo = getLevelInfo(profile.level, t);

  // Get display name from session
  const displayName = viewer?.first_name
    ? [viewer.first_name, viewer.middle_name, viewer.last_name].filter(Boolean).join(' ')
    : viewer?.username;

  return (
    <Card className={cn('py-2', className)}>
      <div className="px-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
          {/* Left: Avatar & Level */}
          <div className="flex shrink-0 flex-col items-center gap-3">
            <div className="relative">
              <GamifiedUserAvatar
                size="3xl"
                gamificationProfile={profile}
                showLevelBadge={false}
                use_with_session
                className="ring-background relative ring-4"
              />

              {/* Level badge - positioned on avatar */}
              <div className="absolute -right-0.5 -bottom-0.5">
                <GlowingLevelBadge
                  level={profile.level}
                  size="lg"
                  animated={false}
                />
              </div>
            </div>

            {/* Streak indicators */}
            <div className="flex gap-2">
              <StreakBadge
                type="fire"
                value={streakStatus.login}
                label={t('streaks.loginStreak')}
              />
              <StreakBadge
                type="zap"
                value={streakStatus.learning}
                label={t('streaks.learningStreak')}
              />
            </div>
          </div>

          {/* Right: Stats & Progress */}
          <div className="flex-1 space-y-5">
            {/* Header with username and level title */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-semibold tracking-tight">{displayName}</h2>
                {userRank && userRank <= 3 && (
                  <Badge
                    variant="secondary"
                    className={cn(
                      'gap-1 px-2 py-1',
                      userRank === 1 &&
                        'border-amber-400/40 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
                      userRank === 2 &&
                        'border-slate-400/40 bg-slate-50 text-slate-600 dark:bg-slate-800/40 dark:text-slate-400',
                      userRank === 3 &&
                        'border-orange-400/40 bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400',
                    )}
                  >
                    <Trophy className="h-3 w-3" />#{userRank}
                  </Badge>
                )}
              </div>

              {/* Level title with icon */}
              <div className="flex items-center gap-2">
                <levelInfo.icon className={cn('h-5 w-5', levelInfo.color)} />
                <p className={cn('text-lg font-semibold', levelInfo.color)}>{levelInfo.title}</p>
                <span className="text-muted-foreground text-sm">
                  • {t('levelIndicators.level')} {profile.level}
                </span>
              </div>

              <p className="text-muted-foreground text-sm">{t(`levels.${getLevelKey(profile.level)}`)}</p>
            </div>

            {/* Level Progress */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('progress.levelProgress')}</span>
                <span className="font-medium">
                  {t('progress.levelTransition', {
                    current: profile.level,
                    next: profile.level + 1,
                  })}
                </span>
              </div>
              <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${xpProgress}%` }}
                  role="progressbar"
                  aria-valuenow={xpProgress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <div className="text-muted-foreground flex justify-between text-xs">
                <span className="tabular-nums">
                  {formatNumber(profile.xp_in_current_level || 0)} {t('progress.xpAbbreviation')}
                </span>
                <span className="tabular-nums">
                  {formatNumber(xpToNext)} {t('progress.xpToGo')}
                </span>
              </div>
            </div>

            {/* Daily XP Progress */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  {t('progress.dailyXP')}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {formatNumber(profile.daily_xp_earned || 0)} / 500
                  {dailyXpProgress >= 100 && (
                    <span className="text-foreground ml-1.5 font-medium">{t('dailyCapReached')}</span>
                  )}
                </span>
              </div>
              <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(dailyXpProgress, 100)}%` }}
                  role="progressbar"
                  aria-valuenow={Math.min(dailyXpProgress, 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-3 gap-3 pt-1">
              <StatCard
                icon={Trophy}
                label={t('stats.totalXP')}
                value={formatNumber(profile.total_xp || 0)}
                iconColor="text-amber-500"
              />
              <StatCard
                icon={TrendingUp}
                label={t('stats.rank')}
                value={userRank ? `#${userRank}` : '-'}
                iconColor="text-sky-500"
              />
              <StatCard
                icon={Calendar}
                label={t('stats.nextMilestone')}
                value={nextMilestone ? `${t('progress.levelShort')} ${nextMilestone}` : t('stats.maxLevel')}
                iconColor="text-violet-500"
              />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * Streak Badge
 */
function StreakBadge({ type, value, label }: { type: 'fire' | 'zap'; value: number; label: string }) {
  const Icon = type === 'fire' ? Flame : Zap;
  const activeIconColor = type === 'fire' ? 'text-orange-500' : 'text-amber-500';
  const activeBadgeClass =
    type === 'fire'
      ? 'border-orange-300/40 bg-orange-50 dark:bg-orange-950/30'
      : 'border-amber-300/40 bg-amber-50 dark:bg-amber-950/30';

  return (
    <Badge
      variant="secondary"
      className={cn('gap-1.5 px-2.5 py-1', value > 0 && activeBadgeClass)}
      title={label}
    >
      <Icon className={cn('h-3.5 w-3.5', value > 0 ? activeIconColor : 'text-muted-foreground')} />
      <span className={cn('text-xs font-semibold', value === 0 && 'text-muted-foreground')}>{value}</span>
    </Badge>
  );
}

/**
 * Compact Stat Card
 */
function StatCard({
  icon: Icon,
  label,
  value,
  iconColor,
}: {
  icon: any;
  label: string;
  value: string;
  iconColor?: string;
}) {
  return (
    <div className="bg-muted/40 space-y-1 rounded-md p-3 text-center">
      <Icon className={cn('mx-auto h-4 w-4', iconColor ?? 'text-muted-foreground')} />
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/**
 * Helper to get level title key
 */
function getLevelKey(level: number): string {
  if (level >= 50) return 'grandmaster';
  if (level >= 25) return 'master';
  if (level >= 15) return 'expert';
  if (level >= 10) return 'scholar';
  if (level >= 5) return 'apprentice';
  return 'novice';
}
