'use client';

import { useGamificationStore } from '@/stores/gamification';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

const TODAY_KEY = `gamification:lastLoginAward:${new Date().toISOString().slice(0, 10)}`;

export function LoginBonusHandler() {
  const t = useTranslations('DashPage.UserAccountSettings.Gamification');
  const profile = useGamificationStore((s) => s.profile);
  const updateStreak = useGamificationStore((s) => s.updateStreak);
  const awardXP = useGamificationStore((s) => s.awardXP);
  const [showBadge, setShowBadge] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(false);
  const hasAttemptedRef = useRef(false);

  useEffect(() => {
    if (!profile) return;
    if (hasAttemptedRef.current) return;

    isMountedRef.current = true;

    try {
      const alreadyDone = typeof globalThis.window !== 'undefined' ? localStorage.getItem(TODAY_KEY) : null;

      if (alreadyDone) return;

      hasAttemptedRef.current = true;

      void (async () => {
        try {
          await updateStreak('login');
          await awardXP(
            {
              source: 'login_bonus',
              idempotency_key: `login_bonus_${profile.user_id}_${new Date().toISOString().slice(0, 10)}`,
            },
            { silent: true },
          );

          localStorage.setItem(TODAY_KEY, '1');

          if (isMountedRef.current) {
            setShowBadge(true);
            timeoutRef.current = globalThis.setTimeout(() => {
              if (isMountedRef.current) setShowBadge(false);
            }, 5000);
          }
        } catch (error) {
          console.warn('Failed to award login bonus:', error);
        }
      })();
    } catch (error) {
      console.warn('localStorage not available:', error);
    }

    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [profile, updateStreak, awardXP]);

  if (!showBadge) return null;

  return (
    <div
      className="animate-in fade-in slide-in-from-bottom-5 pointer-events-none fixed right-4 bottom-20 z-50 duration-300"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg bg-gradient-to-r from-emerald-500/95 to-green-600/95 px-4 py-3 text-sm font-semibold text-white shadow-xl ring-1 ring-white/20 backdrop-blur-md">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-xl">
          <span aria-hidden>✨</span>
        </div>

        <div className="min-w-0">
          <div className="truncate">{t('loginBonus.dailyBonus', { xp: 10 })}</div>
        </div>
      </div>
    </div>
  );
}
