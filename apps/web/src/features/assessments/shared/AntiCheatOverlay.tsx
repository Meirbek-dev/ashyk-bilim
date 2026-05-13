'use client';

/**
 * AntiCheatOverlay — Proctored mode indicator with violation counter.
 *
 * Displays when anti-cheat is enabled. Shows the current violation count
 * and threshold. Reports violations to the server on detection.
 */

import { Shield, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AntiCheatOverlayProps {
  /** Whether anti-cheat monitoring is active. */
  enabled: boolean;
  /** Current violation count (from server state). */
  violationCount: number;
  /** Maximum violations before auto-submit/zero. null = no limit. */
  violationThreshold: number | null;
  className?: string;
}

export default function AntiCheatOverlay({
  enabled,
  violationCount,
  violationThreshold,
  className,
}: AntiCheatOverlayProps) {
  if (!enabled) return null;

  const isNearThreshold = violationThreshold !== null && violationCount >= violationThreshold - 1;
  const isAtThreshold = violationThreshold !== null && violationCount >= violationThreshold;

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium',
        !isNearThreshold && 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
        isNearThreshold && !isAtThreshold && 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300',
        isAtThreshold && 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
        className,
      )}
      role="status"
      aria-label={`Proctored mode active. Violations: ${violationCount}${violationThreshold ? ` of ${violationThreshold}` : ''}`}
    >
      {isAtThreshold ? <ShieldAlert className="size-3.5" /> : <Shield className="size-3.5" />}
      <span>Proctored</span>
      {violationThreshold !== null && (
        <span className="ml-1 opacity-75">
          {violationCount}/{violationThreshold}
        </span>
      )}
    </div>
  );
}
