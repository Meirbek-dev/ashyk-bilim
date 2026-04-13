'use client';

import { Activity, Crown, Flame, Star, Target, Trophy, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import GamifiedUserAvatar from '@/components/Objects/GamifiedUserAvatar';
import { AVATAR_UNLOCKS, getLevelInfo } from '@/lib/gamification/levels';
import { GlowingLevelBadge, LevelProgress } from '@/lib/gamification';
import type { UserGamificationProfile } from '@/types/gamification';
import { useGamificationStore } from '@/stores/gamification';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface GamificationProfileSectionProps {
  userId?: number;
  className?: string;
  variant?: 'full' | 'compact';
  showUnlocks?: boolean;
  data?: UserGamificationProfile | null;
}

export function GamificationProfileSection({
  userId: _userId,
  className,
  variant: _variant = 'full',
  showUnlocks = true,
  data,
}: GamificationProfileSectionProps) {
  const t = useTranslations('DashPage.UserAccountSettings.Gamification');
  const storeProfile = useGamificationStore((s) => s.profile);
  const storeIsLoading = useGamificationStore((s) => s.isLoading);
  const profile = data ?? storeProfile ?? null;
  const isLoading = !profile && storeIsLoading;
  const { levelInfo, nextMilestone, unlockedFrames, unlockedAccessories } = (() => {
    if (!profile) {
      return {
        levelInfo: null,
        nextMilestone: null,
        unlockedFrames: [] as (typeof AVATAR_UNLOCKS.frames)[number][],
        unlockedAccessories: [] as (typeof AVATAR_UNLOCKS.accessories)[number][],
      };
    }
    return {
      levelInfo: getLevelInfo(profile.level, t),
      nextMilestone: getNextMilestone(profile.level),
      unlockedFrames: AVATAR_UNLOCKS.frames.filter((f) => profile.level >= f.level),
      unlockedAccessories: AVATAR_UNLOCKS.accessories.filter((a) => profile.level >= a.level),
    };
  })();

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            {t('dashboard.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-muted h-4 animate-pulse rounded" />
            <div className="bg-muted h-20 animate-pulse rounded" />
            <div className="bg-muted h-16 animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!profile) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            {t('dashboard.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground py-4 text-center">{t('dashboard.noData')}</p>
        </CardContent>
      </Card>
    );
  }
  const localizeLevelTitle = (raw: string) => {
    const key = raw.toLowerCase();
    try {
      return t(`levels.titles.${key}`);
    } catch {
      return raw; // fallback if missing
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            {t('dashboard.title')}
          </div>
          {levelInfo && (
            <Badge
              variant="outline"
              className={cn('flex items-center gap-1', levelInfo.color)}
            >
              {(() => {
                const Icon = levelInfo.icon;
                return Icon ? <Icon className="h-3 w-3" /> : null;
              })()}
              {levelInfo.title}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar and Level Info */}
        <div className="flex items-start gap-4">
          <GamifiedUserAvatar
            size="2xl"
            gamificationProfile={profile}
            showLevelBadge
            showAvatarFrame
            showAvatarAccessories
            use_with_session
            className="shrink-0"
          />
          <div className="flex-1 space-y-3">
            {/* Level Badge and Progress */}
            <div className="flex items-center justify-between">
              <GlowingLevelBadge
                level={profile.level}
                size="lg"
                animated
              />
              <div className="text-right text-sm">
                <div className="font-semibold">{profile.total_xp.toLocaleString()} XP</div>
                <div className="text-muted-foreground text-xs">
                  {profile.xp_to_next_level?.toLocaleString() || 0} {t('levelIndicators.xpToNext')}
                </div>
              </div>
            </div>

            <LevelProgress
              profile={profile}
              showMilestones
              animated
            />

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                <span>
                  {t('streaks.login.title')}
                  {': '}
                  {profile.login_streak || 0} {t('streaks.days')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-500" />
                <span>
                  {t('streaks.learning.title')}: {profile.learning_streak || 0} {t('streaks.days')}
                </span>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Next Milestone */}
        {nextMilestone && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-2 text-sm font-medium">
              <Target className="h-4 w-4" />
              {t('dashboard.nextMilestone')}
            </h4>
            <Card className="bg-muted/30">
              <CardContent className="">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <nextMilestone.icon className={cn('h-5 w-5', nextMilestone.color)} />
                    <div>
                      <p className="font-medium">
                        {t('levelIndicators.level')} {nextMilestone.level}
                      </p>
                      <p className="text-muted-foreground text-sm">{localizeLevelTitle(nextMilestone.title)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground text-sm">
                      {nextMilestone.minXP - profile.total_xp} {t('levelIndicators.xpToNext')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Unlocked Features - HIDDEN until avatar customization backend is ready */}
        {/* TODO: Re-enable when backend supports equipped_frame_id and equipped_accessories
            See: docs/gamification/AVATAR_CUSTOMIZATION.md
        {showUnlocks && (
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-medium">
              <Award className="h-4 w-4" />
              {t('dashboard.unlockedCustomizations')}
            </h4>

            <div className="grid grid-cols-1 gap-3">
              {unlockedFrames.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-2 text-xs font-medium">
                    {t('avatarCustomization.avatarFrames')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {unlockedFrames.map((frame) => (
                      <Badge
                        key={frame.id}
                        variant="secondary"
                        className="text-xs"
                      >
                        {frame.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {unlockedAccessories.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-2 text-xs font-medium">
                    {t('avatarCustomization.avatarAccessories')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {unlockedAccessories.map((accessory) => (
                      <Badge
                        key={accessory.id}
                        variant="secondary"
                        className="flex items-center gap-1 text-xs"
                      >
                        <span>{accessory.icon}</span>
                        {accessory.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        */}
      </CardContent>
    </Card>
  );
}

// Helper function to get next milestone
function getNextMilestone(currentLevel: number) {
  const milestones = [
    { level: 5, title: 'Apprentice', color: 'text-blue-500', icon: Star, minXP: 1000 },
    { level: 10, title: 'Scholar', color: 'text-purple-500', icon: Zap, minXP: 3000 },
    { level: 15, title: 'Expert', color: 'text-green-500', icon: Trophy, minXP: 6000 },
    { level: 25, title: 'Master', color: 'text-orange-500', icon: Crown, minXP: 12_000 },
    { level: 50, title: 'Grandmaster', color: 'text-red-500', icon: Crown, minXP: 30_000 },
  ];

  return milestones.find((milestone) => currentLevel < milestone.level);
}
