'use client';

import { useEffect, useRef } from 'react';

type ViolationType = 'BLUR' | 'DEVTOOLS' | 'COPY' | 'RESIZE' | 'CONTEXTMENU' | 'KEYDOWN' | 'FULLSCREEN_EXIT';

interface Violation {
  type: ViolationType;
  timestamp: number;
}

interface UseTestGuardOptions {
  onViolation: (type: ViolationType, count: number) => void;
  maxViolations?: number;
  enabled?: boolean;
  preventCopy?: boolean;
  preventRightClick?: boolean;
  trackBlur?: boolean;
  trackDevTools?: boolean;
  // New debounce options to prevent false positives
  blurDebounceMs?: number; // Debounce blur events (default: 500ms)
  devToolsThreshold?: number; // Pixels to consider DevTools open (default: 160)
  devToolsCheckIntervalMs?: number; // How often to check for DevTools (default: 1000ms)
}

/**
 * React hook for quiz/exam anti-cheat protection with debouncing.
 *
 * Features:
 * - Tracks tab blur/focus loss (with debounce to avoid false positives)
 * - Detects DevTools opening (heuristic with configurable threshold)
 * - Prevents copy/paste (only reports if actual content selected/pasted)
 * - Blocks context menu (only on right-click, not synthetic events)
 * - Intercepts common keyboard shortcuts (skips editable fields)
 * - Maintains violation count and history
 * - Debouncing to prevent false positives from rapid events
 *
 * @param options Configuration options for test guard
 * @returns Methods to check lock status, count, violations, and reset
 */
export function useTestGuard({
  onViolation,
  maxViolations = 2,
  enabled = true,
  preventCopy = true,
  preventRightClick = true,
  trackBlur = true,
  trackDevTools = true,
  blurDebounceMs = 500,
  devToolsThreshold = 160,
  devToolsCheckIntervalMs = 1000,
}: UseTestGuardOptions) {
  const violations = useRef<Violation[]>([]);
  const locked = useRef(false);
  const blurTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handlers: (() => void)[] = [];

    const report = (type: ViolationType) => {
      if (locked.current || !enabled) return;

      const violation: Violation = {
        type,
        timestamp: Date.now(),
      };

      // Debug logging to help diagnose false positives
      try {
        if (process.env.NODE_ENV !== 'production') {
          // Capture helpful context: active element and simple stack
          const active = document.activeElement;
          console.debug('[useTestGuard] report', {
            type,
            activeTag: active?.tagName,
            activeId: (active as HTMLElement | null)?.id,
            activeClasses: (active as HTMLElement | null)?.className,
          });
        }
      } catch (error) {
        // ignore logging errors
        void error;
      }

      violations.current.push(violation);
      const count = violations.current.length;

      onViolation(type, count);

      if (count >= maxViolations) {
        locked.current = true;
      }
    };

    // 1. Blur/Focus tracking with debounce to prevent false positives
    if (trackBlur) {
      const handleBlur = () => {
        // Clear any existing timeout
        if (blurTimeout.current) {
          clearTimeout(blurTimeout.current);
        }

        // Debounce: only report if focus doesn't return within debounceMs
        blurTimeout.current = setTimeout(() => {
          // Double-check we're still blurred
          if (document.hidden || !document.hasFocus()) {
            report('BLUR');
          }
        }, blurDebounceMs);
      };

      const handleFocus = () => {
        // User returned to tab - cancel pending blur report
        if (blurTimeout.current) {
          clearTimeout(blurTimeout.current);
          blurTimeout.current = null;
        }
      };

      const onVisibility = () => {
        if (document.hidden) {
          handleBlur();
        } else {
          handleFocus();
        }
      };

      window.addEventListener('blur', handleBlur);
      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', onVisibility);

      handlers.push(() => {
        if (blurTimeout.current) {
          clearTimeout(blurTimeout.current);
        }
        window.removeEventListener('blur', handleBlur);
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', onVisibility);
      });
    }

    // 2. DevTools detection (heuristic with configurable threshold)
    if (trackDevTools) {
      let lastWidth = window.outerWidth;
      let lastHeight = window.outerHeight;
      let devToolsViolationCount = 0;
      const requiredConsistentChecks = 2; // Require 2 consistent checks before reporting

      const checkDevTools = () => {
        const widthDiff = window.outerWidth - window.innerWidth;
        const heightDiff = window.outerHeight - window.innerHeight;
        const sizeChange =
          Math.abs(window.outerWidth - lastWidth) > 100 || Math.abs(window.outerHeight - lastHeight) > 100;

        // Only report if threshold exceeded and significant size change
        if ((widthDiff > devToolsThreshold || heightDiff > devToolsThreshold) && sizeChange) {
          devToolsViolationCount += 1;

          // Require multiple consistent checks to reduce false positives
          if (devToolsViolationCount >= requiredConsistentChecks) {
            report('DEVTOOLS');
            devToolsViolationCount = 0; // Reset after reporting
          }

          lastWidth = window.outerWidth;
          lastHeight = window.outerHeight;
        } else {
          // Reset count if conditions not met
          devToolsViolationCount = 0;
        }
      };

      const interval = setInterval(checkDevTools, devToolsCheckIntervalMs);

      handlers.push(() => clearInterval(interval));
    }

    // 3. Copy/Paste/Context menu prevention (hardened to reduce false positives)
    if (preventCopy || preventRightClick) {
      const preventClipboard = (e: ClipboardEvent) => {
        try {
          // Only consider clipboard events if there is an actual selection or pasted text
          if (e.type === 'copy' || e.type === 'cut') {
            const sel = typeof globalThis.getSelection === 'function' ? globalThis.getSelection()?.toString() : '';
            if (!sel) return;
          }
          if (e.type === 'paste') {
            const data = e.clipboardData?.getData('text') ?? '';
            if (!data) return;
          }
        } catch {
          // In case of unexpected environment, be conservative and ignore
          return;
        }

        e.preventDefault();
        report('COPY');
      };

      if (preventCopy) {
        document.addEventListener('copy', preventClipboard);
        document.addEventListener('cut', preventClipboard);
        document.addEventListener('paste', preventClipboard);

        handlers.push(() => {
          document.removeEventListener('copy', preventClipboard);
          document.removeEventListener('cut', preventClipboard);
          document.removeEventListener('paste', preventClipboard);
        });
      }

      if (preventRightClick) {
        const preventContext = (e: MouseEvent) => {
          // Only treat real right-clicks (button === 2) as violations; ignore synthetic or left-click contextmenu
          if (typeof e.button === 'number' && e.button !== 2) return;
          e.preventDefault();
          report('CONTEXTMENU');
        };
        document.addEventListener('contextmenu', preventContext);
        handlers.push(() => {
          document.removeEventListener('contextmenu', preventContext);
        });
      }

      // 4. Keyboard shortcuts - only when not typing in an input/textarea/contentEditable
      const keydown = (e: KeyboardEvent) => {
        const active = document.activeElement as HTMLElement | null;
        const isEditable =
          active !== null &&
          (active.tagName === 'INPUT' ||
            active.tagName === 'TEXTAREA' ||
            // contentEditable check
            active.getAttribute?.('contenteditable') === 'true');

        if (isEditable) return;

        if ((e.ctrlKey || e.metaKey) && ['c', 'a', 'u', 's', 'p', 'x'].includes(e.key.toLowerCase())) {
          e.preventDefault();
          report('KEYDOWN');
        }
      };

      document.addEventListener('keydown', keydown);
      handlers.push(() => {
        document.removeEventListener('keydown', keydown);
      });
    }

    // 5. Warn before leaving
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', beforeUnload);
    handlers.push(() => window.removeEventListener('beforeunload', beforeUnload));

    // Cleanup all handlers
    return () => {
      handlers.forEach((cleanup) => cleanup());
    };
  }, [
    enabled,
    preventCopy,
    preventRightClick,
    trackBlur,
    trackDevTools,
    maxViolations,
    onViolation,
    blurDebounceMs,
    devToolsThreshold,
    devToolsCheckIntervalMs,
  ]);

  return {
    isLocked: () => locked.current,
    getCount: () => violations.current.length,
    getViolations: () => violations.current,
    reset: () => {
      violations.current = [];
      locked.current = false;
    },
  };
}
