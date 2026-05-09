/**
 * Level Up Celebration Component
 *
 * Respects mobile, reduced-motion, and reduced-data preferences.
 * Mobile: Always uses compact mode.
 * Reduced motion: Simplified animations.
 * Reduced data: Skip particle effects, use lighter animations.
 */

'use client';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useReducedData } from '@/hooks/use-reduced-data';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

interface LevelUpCelebrationProps {
  newLevel: number;
  onDismiss: () => void;
  compact?: boolean;
}

export function LevelUpCelebration({ newLevel, onDismiss, compact = false }: LevelUpCelebrationProps) {
  const t = useTranslations('DashPage.UserAccountSettings.Gamification');
  const isMobile = useIsMobile();
  const prefersReducedMotion = useReducedMotion();
  const prefersReducedData = useReducedData();

  // Force compact mode on mobile or reduced data
  const shouldUseCompact = compact || isMobile || prefersReducedData;

  const compactParticlesRef = useRef(
    Array.from({ length: 8 }, () => ({
      xOffset: (Math.random() - 0.5) * 100,
      yOffset: (Math.random() - 0.5) * 100,
      delay: Math.random() * 0.5,
    })),
  );

  const fullscreenParticlesRef = useRef(
    Array.from({ length: 30 }, () => ({
      xOffset: (Math.random() - 0.5) * 600,
      yOffset: (Math.random() - 0.5) * 600,
      delay: Math.random() * 0.8,
    })),
  );

  const compactParticles = compactParticlesRef.current;
  const fullscreenParticles = fullscreenParticlesRef.current;

  useEffect(() => {
    // Auto-dismiss after 4 seconds (3s on mobile for faster flow)
    const timer = setTimeout(
      () => {
        onDismiss();
      },
      isMobile ? 3000 : 4000,
    );

    return () => clearTimeout(timer);
  }, [onDismiss, isMobile]);

  if (shouldUseCompact) {
    // Compact corner notification (less intrusive, mobile-friendly)
    return (
      <motion.div
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 100, y: 100 }}
        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0, y: 0 }}
        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 100 }}
        transition={prefersReducedMotion ? { duration: 0.2 } : { type: 'spring', stiffness: 300, damping: 30 }}
        className="bg-background/95 fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-100 w-[min(calc(100vw-2rem),24rem)] rounded-2xl border border-amber-300 p-4 shadow-xl backdrop-blur-md md:right-6 md:bottom-6 md:max-w-sm md:p-6"
        onClick={onDismiss}
      >
        {/* Subtle sparkle effect (skip if reduced motion or reduced data) */}
        {!prefersReducedMotion && !prefersReducedData && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
            {compactParticles.map((particle, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0 }}
                animate={{
                  opacity: [0, 0.6, 0],
                  scale: [0, 1.5, 0],
                  x: [0, particle.xOffset],
                  y: [0, particle.yOffset],
                }}
                transition={{
                  duration: 1.5,
                  delay: particle.delay,
                  repeat: 2,
                }}
                className="absolute top-1/2 left-1/2 h-1.5 w-1.5 rounded-full bg-yellow-400"
              />
            ))}
          </div>
        )}

        <div className="relative flex items-center gap-3 md:gap-4">
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0, rotate: -90 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { scale: 1, rotate: 0 }}
            transition={prefersReducedMotion ? { duration: 0.2 } : { type: 'spring', stiffness: 400, damping: 15 }}
            className="shrink-0"
          >
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-2.5 md:p-3">
              <Sparkles className="h-6 w-6 text-amber-600 md:h-8 md:w-8" />
            </div>
          </motion.div>

          <div className="min-w-0 flex-1">
            <motion.h3
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.2 }}
              className="text-foreground mb-1 text-lg font-bold md:text-xl"
            >
              {t('levelUpTitle')}
            </motion.h3>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.3 }}
              className="text-base font-semibold text-amber-700 md:text-lg"
            >
              {t('reachedLevel', { level: newLevel })}
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.4 }}
              className="text-muted-foreground mt-1 text-xs"
            >
              {t('clickAnywhereToClose')}
            </motion.p>
          </div>
        </div>
      </motion.div>
    );
  }

  // Full-screen celebration (default)
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <motion.div
        initial={{ scale: 0.5, rotate: -15, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        exit={{ scale: 0.5, rotate: 15, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="bg-background relative mx-4 max-w-lg rounded-3xl border border-amber-300 p-12 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sparkles animation */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
          {fullscreenParticles.map((particle, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: [0, 1, 0],
                scale: [0, 1.5, 0],
                x: particle.xOffset,
                y: particle.yOffset,
              }}
              transition={{
                duration: 2,
                delay: particle.delay,
                repeat: 2,
              }}
              className="absolute top-1/2 left-1/2 h-2 w-2 rounded-full bg-amber-300 shadow-lg shadow-amber-200/60"
            />
          ))}
        </div>

        <motion.div
          animate={{
            rotate: [0, 5, -5, 0],
            scale: [1, 1.05, 1],
          }}
          transition={{
            duration: 0.6,
            repeat: 3,
            repeatDelay: 0.5,
          }}
          className="relative"
        >
          <div className="mb-4 inline-flex rounded-full border border-amber-300 bg-amber-50 p-4">
            <Sparkles className="h-20 w-20 text-amber-600" />
          </div>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-foreground mb-3 text-5xl font-bold drop-shadow-lg"
        >
          {t('levelUpTitle')}
        </motion.h2>

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, type: 'spring' }}
          className="mb-6 inline-block rounded-2xl border border-amber-300 bg-amber-50 px-8 py-3"
        >
          <p className="text-4xl font-black text-amber-700">{t('reachedLevel', { level: newLevel })}</p>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onDismiss}
          className="mt-4 rounded-xl bg-amber-500 px-8 py-3 font-bold text-black shadow-lg shadow-amber-200/60 transition-all hover:bg-amber-400"
        >
          {t('continue')}
        </motion.button>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="text-muted-foreground mt-4 text-sm"
        >
          {t('clickAnywhereToClose')}
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
