'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const getTimerColor = (seconds: number | null): string => {
  if (seconds === null) return 'text-blue-900';
  if (seconds <= 60) return 'text-red-600';
  if (seconds <= 300) return 'text-orange-600';
  return 'text-blue-900';
};

const getTimerBgColor = (seconds: number | null): string => {
  if (seconds === null) return 'bg-gradient-to-br from-blue-50 to-blue-100';
  if (seconds <= 60) return 'bg-gradient-to-br from-red-50 to-red-100';
  if (seconds <= 300) return 'bg-gradient-to-br from-orange-50 to-orange-100';
  return 'bg-gradient-to-br from-blue-50 to-blue-100';
};

interface ExamTimerProps {
  startedAt: string;
  timeLimitMinutes?: number | null;
  onExpire?: (reason?: string) => void;
  className?: string;
}

export default function ExamTimer({ startedAt, timeLimitMinutes, onExpire, className = '' }: ExamTimerProps) {
  const t = useTranslations('Activities.ExamActivity');
  const [remaining, setRemaining] = useState<number | null>(null);
  const calledExpire = useRef(false);

  useEffect(() => {
    if (!startedAt || !timeLimitMinutes) {
      // Schedule clearing remaining asynchronously to avoid synchronous setState within effect
      void Promise.resolve().then(() => setRemaining(null));
      return;
    }

    // Reset expire flag when timer params change
    calledExpire.current = false;

    const startTs = new Date(startedAt).getTime();
    const endTs = startTs + (timeLimitMinutes || 0) * 60 * 1000;

    const update = () => {
      const now = Date.now();
      const remMs = Math.max(0, endTs - now);
      const secs = Math.floor(remMs / 1000);
      setRemaining(secs);

      if (remMs <= 0 && !calledExpire.current) {
        calledExpire.current = true;
        onExpire?.('Time expired');
      }
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startedAt, timeLimitMinutes, onExpire]);

  if (remaining === null) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className={`group relative overflow-hidden rounded-xl border-2 transition-all duration-300 ${
        remaining <= 60
          ? 'animate-pulse border-red-400 shadow-lg shadow-red-200'
          : remaining <= 300
            ? 'border-orange-400 shadow-md shadow-orange-100'
            : 'border-blue-400 shadow-sm'
      } ${getTimerBgColor(remaining)} ${className}`}
    >
      {/* Background gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-transparent" />

      {/* Content */}
      <div className="relative flex items-center gap-3 px-5 py-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-300 ${
            remaining <= 60 ? 'bg-red-600' : remaining <= 300 ? 'bg-orange-600' : 'bg-blue-600'
          }`}
        >
          <Clock className={`h-5 w-5 text-white ${remaining <= 60 ? 'animate-pulse' : ''}`} />
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-600">{t('timeRemaining')}</p>
          <p className={`text-2xl font-bold tracking-tight tabular-nums ${getTimerColor(remaining)}`}>
            {formatTime(remaining)}
          </p>
        </div>
      </div>

      {/* Progress bar at bottom */}
      {timeLimitMinutes && (
        <div className="absolute right-0 bottom-0 left-0 h-1.5 bg-gray-200/50">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${
              remaining <= 60 ? 'bg-red-600' : remaining <= 300 ? 'bg-orange-600' : 'bg-blue-600'
            }`}
            style={{
              width: `${Math.max(0, Math.min(100, (remaining / (timeLimitMinutes * 60)) * 100))}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
