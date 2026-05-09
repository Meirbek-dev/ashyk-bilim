/**
 * XP Toast with Notification Queue
 *
 * Improvements over old system:
 * - Automatic batching of similar XP gains
 * - Smart positioning
 * - Queue management
 * - Less intrusive design
 */

'use client';

import { XPNotificationContainer, useXPNotificationQueue } from '@/lib/gamification/components/notification-queue';
import type { XPNotification } from '@/lib/gamification/components/notification-queue';
import { ParticleEffect } from '@/lib/gamification/components/level-indicators';
import { AnimatedValue } from '@/lib/gamification/components/animated-value';
import { useReducedData } from '@/hooks/use-reduced-data';
import { getXPSourceTheme } from '@/lib/gamification';

import { useTranslations } from 'next-intl';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// XP Toast Component
// ============================================================================

interface XPToastProps {
  notification: XPNotification & { batchCount: number; totalAmount: number };
  onDismiss: () => void;
}

function XPToast({ notification, onDismiss }: XPToastProps) {
  const t = useTranslations('DashPage.UserAccountSettings.Gamification');
  const theme = getXPSourceTheme(notification.source);
  const prefersReducedData = useReducedData();

  const getSourceLabel = (sourceKey: string): string => {
    const labelKey = `xpSources.${sourceKey}`;
    const translated = t(labelKey);
    return translated === labelKey ? sourceKey.replace(/_/g, ' ') : translated;
  };

  const sourceLabel = getSourceLabel(notification.source);
  const isBatched = notification.batchCount > 1;

  return (
    <motion.div
      layout
      className={cn(
        'group relative w-80 overflow-hidden rounded-lg border bg-card shadow-lg',
        'hover:shadow-xl transition-shadow duration-200',
      )}
    >
      {/* Background gradient */}
      <div
        className={cn('absolute inset-0 opacity-5', theme.bgColor)}
        style={{
          background: `linear-gradient(135deg, ${theme.bgColor.replace('bg-', '')} 0%, transparent 100%)`,
        }}
      />

      {/* Content */}
      <div className="relative flex items-center gap-3 p-4">
        {/* Icon */}
        <div className={cn('shrink-0 rounded-lg p-2', theme.bgColor)}>
          <theme.icon className={cn('h-5 w-5', theme.color)} />
        </div>

        {/* Text Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-foreground text-lg font-bold">+</span>
            <AnimatedValue
              value={notification.totalAmount}
              className={cn('text-lg font-bold tabular-nums', theme.color)}
              format={(v) => Math.round(v).toLocaleString()}
            />
            <span className="text-muted-foreground text-sm">XP</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <p className="text-muted-foreground truncate text-xs">
              {isBatched ? t('toast.fromActivities', { count: notification.batchCount }) : sourceLabel}
            </p>
          </div>
        </div>

        {/* Dismiss Button */}
        <button
          onClick={onDismiss}
          className="hover:bg-muted shrink-0 rounded-md p-1.5 opacity-0 transition-opacity group-hover:opacity-100"
          aria-label={t('accessibility.closeNotification')}
        >
          <X className="text-muted-foreground h-4 w-4" />
        </button>
      </div>

      {/* Level Up Indicator */}
      {notification.triggeredLevelUp && (
        <div className="border-t bg-linear-to-r from-blue-500 via-purple-500 to-pink-500 px-4 py-2">
          <p className="text-center text-sm font-bold text-white">🎉 {t('toast.levelUp')} 🎉</p>
        </div>
      )}

      {/* Particle effect for level ups (skip if reduced data) */}
      {notification.triggeredLevelUp && !prefersReducedData && (
        <ParticleEffect
          trigger
          particleCount={15}
        />
      )}
    </motion.div>
  );
}

// ============================================================================
// XP Toast Hook
// ============================================================================

export interface ShowXPToastOptions {
  amount: number;
  source?: string;
  triggeredLevelUp?: boolean;
  showSourceLabel?: boolean;
}

export function useXPToast() {
  const { notifications, addNotification, dismissNotification } = useXPNotificationQueue({
    maxVisible: 3,
    batchWindowMs: 2000,
    displayDurationMs: 3000,
    position: 'bottom-right',
  });

  const showXPToast = ({ amount, source = 'default', triggeredLevelUp = false }: ShowXPToastOptions) => {
    addNotification({
      amount,
      source,
      triggeredLevelUp,
    });
  };

  const renderNotification = (notification: any) => (
    <XPToast
      notification={notification}
      onDismiss={() => dismissNotification(notification.id)}
    />
  );

  // ToastContainer component
  const ToastContainer = () => {
    return (
      <XPNotificationContainer
        notifications={notifications}
        position="bottom-right"
        onDismiss={dismissNotification}
        renderNotification={renderNotification}
      />
    );
  };

  return {
    showXPToast,
    ToastContainer,
  };
}
