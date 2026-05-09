'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GamificationProfileSection } from '@/components/Dashboard/Gamification';
import { updatePreferencesAction } from '@/app/actions/gamification';
import { useGamificationStore } from '@/stores/gamification';
import { Check, Loader2, Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

/**
 * Gamification Settings
 *
 * Core preference toggles:
 * - Show on leaderboard (privacy.showOnLeaderboard)
 * - XP gain notifications (notifications.xpGain)
 * - Animated effects (display.animatedEffects)
 */

interface GamificationPreferences {
  showOnLeaderboard: boolean;
  xpGainNotifications: boolean;
  animatedEffects: boolean;
}

const DEFAULT_PREFERENCES: GamificationPreferences = {
  showOnLeaderboard: true,
  xpGainNotifications: true,
  animatedEffects: true,
};

export default function UserGamificationSettings() {
  const t = useTranslations('DashPage.UserAccountSettings.Gamification');
  const profile = useGamificationStore((s) => s.profile);

  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const saveSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Load preferences from profile
  useEffect(() => {
    if (profile?.preferences) {
      const prefs = profile.preferences as any;
      setPreferences({
        showOnLeaderboard: prefs?.privacy?.showOnLeaderboard ?? DEFAULT_PREFERENCES.showOnLeaderboard,
        xpGainNotifications: prefs?.notifications?.xpGain ?? DEFAULT_PREFERENCES.xpGainNotifications,
        animatedEffects: prefs?.display?.animatedEffects ?? DEFAULT_PREFERENCES.animatedEffects,
      });
    }
  }, [profile]);

  const handlePreferenceChange = (key: keyof GamificationPreferences, value: boolean) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Map simplified preferences to full structure
      const fullPreferences = {
        privacy: {
          showOnLeaderboard: preferences.showOnLeaderboard,
        },
        notifications: {
          xpGain: preferences.xpGainNotifications,
        },
        display: {
          animatedEffects: preferences.animatedEffects,
        },
      };

      await updatePreferencesAction(fullPreferences);

      setHasChanges(false);
      setSaveSuccess(true);
      toast.success(t('settings.saved'));

      // Reset success indicator after 2 seconds
      if (saveSuccessTimeoutRef.current) clearTimeout(saveSuccessTimeoutRef.current);
      saveSuccessTimeoutRef.current = globalThis.setTimeout(() => {
        setSaveSuccess(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to save preferences:', error);
      toast.error(t('settings.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    return () => {
      if (saveSuccessTimeoutRef.current) clearTimeout(saveSuccessTimeoutRef.current);
    };
  }, []);

  return (
    <div className="mx-8 space-y-6">
      {/* Profile Overview */}
      <GamificationProfileSection
        variant="full"
        showUnlocks
      />

      {/* Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.title')}</CardTitle>
          <CardDescription>{t('settings.descriptionSimplified')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Show on Leaderboard */}
          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label htmlFor="show-leaderboard">{t('settings.showOnLeaderboard')}</Label>
              <p className="text-muted-foreground text-sm">{t('settings.showOnLeaderboardDescription')}</p>
            </div>
            <Switch
              id="show-leaderboard"
              checked={preferences.showOnLeaderboard}
              onCheckedChange={(checked) => handlePreferenceChange('showOnLeaderboard', checked)}
            />
          </div>

          {/* XP Gain Notifications */}
          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label htmlFor="xp-notifications">{t('settings.xpGainNotifications')}</Label>
              <p className="text-muted-foreground text-sm">{t('settings.xpGainNotificationsDescription')}</p>
            </div>
            <Switch
              id="xp-notifications"
              checked={preferences.xpGainNotifications}
              onCheckedChange={(checked) => handlePreferenceChange('xpGainNotifications', checked)}
            />
          </div>

          {/* Animated Effects */}
          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label htmlFor="animated-effects">{t('settings.animatedEffects')}</Label>
              <p className="text-muted-foreground text-sm">{t('settings.animatedEffectsDescription')}</p>
            </div>
            <Switch
              id="animated-effects"
              checked={preferences.animatedEffects}
              onCheckedChange={(checked) => handlePreferenceChange('animatedEffects', checked)}
            />
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-end gap-3 pt-4">
            {saveSuccess && (
              <span className="flex items-center gap-2 text-sm text-green-600">
                <Check className="h-4 w-4" />
                {t('settings.saved')}
              </span>
            )}
            <Button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="min-w-[120px]"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('settings.saving')}
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {t('settings.save')}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
