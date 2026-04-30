'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useTestGuard } from '@/hooks/useTestGuard';
import { isAntiCheatEnabled } from '@/features/assessments/domain/policy';
import type { PolicyView } from '@/features/assessments/domain/policy';

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};

export interface AttemptTimerConfig {
  startedAt: string | null;
  timeLimitMinutes?: number | null;
  onExpire?: () => void;
}

export interface AttemptGuardOptions {
  enabled?: boolean;
  timer?: AttemptTimerConfig | null;
  initialViolationCount?: number;
  onViolation?: (type: string, count: number) => void | Promise<void>;
  onThresholdReached?: (type: string, count: number) => void;
}

export function useAttemptGuard(policy: PolicyView, options: AttemptGuardOptions = {}) {
  const { antiCheat } = policy;
  const enabled = options.enabled ?? isAntiCheatEnabled(antiCheat);
  const [violationCount, setViolationCount] = useState(options.initialViolationCount ?? 0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenRequestFailed, setFullscreenRequestFailed] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const fullscreenEnteredRef = useRef(false);
  const violationCountRef = useRef(violationCount);
  const onViolationRef = useRef(options.onViolation);
  const onThresholdReachedRef = useRef(options.onThresholdReached);
  const onExpireRef = useRef(options.timer?.onExpire);
  const expiredRef = useRef(false);

  useEffect(() => {
    setViolationCount(options.initialViolationCount ?? 0);
  }, [options.initialViolationCount]);

  useEffect(() => {
    violationCountRef.current = violationCount;
  }, [violationCount]);

  useEffect(() => {
    onViolationRef.current = options.onViolation;
    onThresholdReachedRef.current = options.onThresholdReached;
    onExpireRef.current = options.timer?.onExpire;
  }, [options.onViolation, options.onThresholdReached, options.timer?.onExpire]);

  const getFullscreenElement = useCallback(() => {
    const fullscreenDocument = document as FullscreenDocument;
    return document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;
  }, []);

  const reportViolation = useCallback(
    (type: string, rawCount?: number) => {
      const nextCount = rawCount ?? violationCountRef.current + 1;
      violationCountRef.current = nextCount;
      setViolationCount(nextCount);
      void onViolationRef.current?.(type, nextCount);

      const threshold = antiCheat.violationThreshold;
      if (threshold && nextCount >= threshold) {
        onThresholdReachedRef.current?.(type, nextCount);
      }
    },
    [antiCheat.violationThreshold],
  );

  useTestGuard({
    enabled,
    preventCopy: antiCheat.copyPasteProtection,
    preventRightClick: antiCheat.rightClickDisabled,
    trackBlur: antiCheat.tabSwitchDetection,
    trackDevTools: antiCheat.devtoolsDetection,
    maxViolations: antiCheat.violationThreshold ?? 999,
    onViolation: (type, count) => reportViolation(type, count),
    blurDebounceMs: 500,
    devToolsThreshold: 180,
    devToolsCheckIntervalMs: 2000,
  });

  const requestFullscreen = useCallback(async () => {
    if (!antiCheat.fullscreenEnforced || typeof document === 'undefined') return;

    const fullscreenDocument = document as FullscreenDocument;
    const target = document.documentElement as FullscreenElement;
    const canUseStandardFullscreen = document.fullscreenEnabled && typeof target.requestFullscreen === 'function';
    const canUseWebkitFullscreen = Boolean(
      fullscreenDocument.webkitFullscreenEnabled && typeof target.webkitRequestFullscreen === 'function',
    );

    if (!canUseStandardFullscreen && !canUseWebkitFullscreen) {
      setFullscreenRequestFailed(true);
      setFullscreenError('Fullscreen is not supported in this browser.');
      toast.warning('Fullscreen is not supported in this browser.');
      return;
    }

    try {
      setFullscreenError(null);
      setFullscreenRequestFailed(false);

      if (target.requestFullscreen) {
        await target.requestFullscreen({ navigationUI: 'hide' });
      } else {
        await target.webkitRequestFullscreen?.();
      }

      if (!getFullscreenElement()) {
        throw new Error('Fullscreen request resolved without an active fullscreen element.');
      }

      fullscreenEnteredRef.current = true;
      setIsFullscreen(true);
    } catch (error) {
      setFullscreenError(error instanceof Error ? error.message : 'Fullscreen is recommended for this attempt.');
      toast.info('Fullscreen is recommended for this attempt.');
    }
  }, [antiCheat.fullscreenEnforced, getFullscreenElement]);

  useEffect(() => {
    if (!enabled || !antiCheat.fullscreenEnforced) return;

    let fullscreenExitTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleFullscreenChange = () => {
      const inFullscreen = Boolean(getFullscreenElement());
      setIsFullscreen(inFullscreen);

      if (inFullscreen) {
        fullscreenEnteredRef.current = true;
        setFullscreenError(null);
      }

      if (!inFullscreen && fullscreenEnteredRef.current) {
        if (fullscreenExitTimeout) clearTimeout(fullscreenExitTimeout);
        fullscreenExitTimeout = setTimeout(() => {
          if (!getFullscreenElement()) {
            toast.warning('Fullscreen was exited.');
            reportViolation('FULLSCREEN_EXIT');
          }
        }, 3000);
      } else if (inFullscreen && fullscreenExitTimeout) {
        clearTimeout(fullscreenExitTimeout);
        fullscreenExitTimeout = null;
      }
    };

    handleFullscreenChange();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      if (fullscreenExitTimeout) clearTimeout(fullscreenExitTimeout);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [antiCheat.fullscreenEnforced, enabled, getFullscreenElement, reportViolation]);

  useEffect(() => {
    return () => {
      if (!getFullscreenElement()) return;

      const fullscreenDocument = document as FullscreenDocument;
      if (document.exitFullscreen) {
        void document.exitFullscreen().catch(() => undefined);
      } else {
        void fullscreenDocument.webkitExitFullscreen?.();
      }
    };
  }, [getFullscreenElement]);

  useEffect(() => {
    const startedAt = options.timer?.startedAt;
    const timeLimitMinutes = options.timer?.timeLimitMinutes;

    if (!startedAt || !timeLimitMinutes) {
      setRemainingSeconds(null);
      expiredRef.current = false;
      return;
    }

    expiredRef.current = false;
    const startTs = new Date(startedAt).getTime();
    const endTs = startTs + timeLimitMinutes * 60 * 1000;

    const update = () => {
      const remainingMs = Math.max(0, endTs - Date.now());
      setRemainingSeconds(Math.floor(remainingMs / 1000));

      if (remainingMs <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current?.();
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [options.timer?.startedAt, options.timer?.timeLimitMinutes]);

  const fullscreenGateOpen = useMemo(
    () => enabled && antiCheat.fullscreenEnforced && !isFullscreen && !fullscreenRequestFailed,
    [antiCheat.fullscreenEnforced, enabled, fullscreenRequestFailed, isFullscreen],
  );

  return {
    enabled,
    violationCount,
    isFullscreen,
    fullscreenGateOpen,
    fullscreenError,
    remainingSeconds,
    requestFullscreen,
  };
}
