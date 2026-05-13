'use client';

/**
 * AttemptTimer — Countdown timer for timed assessments.
 *
 * Uses server timestamps (timer_started_at, timer_expires_at) — never trusts
 * the client clock for enforcement. Visual warnings at 5min and 1min remaining.
 * Announces time via aria-live for screen readers.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AttemptTimerProps {
  /** Server-provided expiry timestamp (ISO string). */
  expiresAt: string;
  /** Called when the timer reaches zero. */
  onExpired?: () => void;
  className?: string;
}

const WARNING_THRESHOLD_SECONDS = 300; // 5 minutes
const CRITICAL_THRESHOLD_SECONDS = 60; // 1 minute

export default function AttemptTimer({ expiresAt, onExpired, className }: AttemptTimerProps) {
  const expiresAtMs = useMemo(() => new Date(expiresAt).getTime(), [expiresAt]);
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000)),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onExpired?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAtMs, onExpired]);

  const isWarning = remainingSeconds <= WARNING_THRESHOLD_SECONDS && remainingSeconds > CRITICAL_THRESHOLD_SECONDS;
  const isCritical = remainingSeconds <= CRITICAL_THRESHOLD_SECONDS;

  const formatted = useMemo(() => {
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }, [remainingSeconds]);

  // Announce time remaining for screen readers (debounced)
  const announcement = useMemo(() => {
    if (isCritical && remainingSeconds > 0 && remainingSeconds % 10 === 0) {
      return `${remainingSeconds} seconds remaining`;
    }
    if (isWarning && remainingSeconds % 60 === 0) {
      return `${Math.floor(remainingSeconds / 60)} minutes remaining`;
    }
    return '';
  }, [remainingSeconds, isCritical, isWarning]);

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-mono tabular-nums',
        !isWarning && !isCritical && 'bg-muted text-muted-foreground',
        isWarning && 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
        isCritical && 'bg-red-100 text-red-800 animate-pulse dark:bg-red-900/30 dark:text-red-300',
        className,
      )}
      role="timer"
      aria-label={`Time remaining: ${formatted}`}
    >
      {isCritical ? <AlertTriangle className="size-3.5" /> : <Clock className="size-3.5" />}
      <span>{formatted}</span>
      {announcement && (
        <span
          className="sr-only"
          aria-live="polite"
          aria-atomic="true"
        >
          {announcement}
        </span>
      )}
    </div>
  );
}
