'use client';

import { AlertTriangle, Clock, Focus, RotateCcw } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PolicyView } from '@/features/assessments/domain/policy';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AssessmentChromeProps {
  /** Assessment kind label shown above the title (e.g. "Assignment", "Exam"). */
  kindLabel: string;
  title: string;
  description?: string | null;
  /** ISO date string or null. */
  dueAt?: string | null;
  /** Whether this attempt was returned for revision. */
  returned?: boolean;
  /** Whether focus mode is currently active. */
  focusMode: boolean;
  onToggleFocusMode: () => void;
  /** Remaining seconds for a timed assessment. `null` = no timer. */
  timerSeconds?: number | null;
  /** Whether anti-cheat checks are active. */
  antiCheatEnabled?: boolean;
  /** Number of recorded violations (shown when > 0). */
  violationCount?: number;
  /** Full policy view, used to describe which checks are active. */
  policy?: PolicyView | null;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * The header card for every assessment attempt surface.
 *
 * Renders the kind label, title, description, due-date badge, timer badge,
 * focus-mode toggle, returned-for-revision alert, and anti-cheat notice.
 *
 * Deliberately does NOT render a save-state badge — that lives exclusively in
 * AssessmentActionBar so students see it in exactly one place.
 */
export function AssessmentChrome({
  kindLabel,
  title,
  description,
  dueAt,
  returned = false,
  focusMode,
  onToggleFocusMode,
  timerSeconds = null,
  antiCheatEnabled = false,
  violationCount = 0,
  policy,
  className,
}: AssessmentChromeProps) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* ── Title card ────────────────────────────────────────────────────── */}
      <header className="bg-card rounded-lg border p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="text-muted-foreground text-xs font-medium uppercase">{kindLabel}</div>
            <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
            {description ? <p className="text-muted-foreground mt-2 max-w-3xl text-sm">{description}</p> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {timerSeconds !== null ? <TimerBadge remainingSeconds={timerSeconds} /> : null}
            {dueAt ? (
              <Badge variant="outline">
                <Clock className="size-3" />
                Due {formatDate(dueAt)}
              </Badge>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onToggleFocusMode}
            >
              <Focus className="size-4" />
              {focusMode ? 'Exit focus' : 'Focus'}
            </Button>
          </div>
        </div>
      </header>

      {/* ── Returned-for-revision notice ──────────────────────────────────── */}
      {returned ? (
        <Alert>
          <RotateCcw className="size-4" />
          <AlertTitle>Returned for revision</AlertTitle>
          <AlertDescription>Review the feedback, update your work, and submit again.</AlertDescription>
        </Alert>
      ) : null}

      {/* ── Anti-cheat notice ─────────────────────────────────────────────── */}
      {antiCheatEnabled ? (
        <Alert variant={violationCount > 0 ? 'destructive' : 'default'}>
          <AlertTriangle className="size-4" />
          <AlertTitle>Attempt integrity checks are active</AlertTitle>
          <AlertDescription>
            {describeAntiCheat(policy)}
            {violationCount > 0 ? ` Violations recorded: ${violationCount}.` : ''}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TimerBadge({ remainingSeconds }: { remainingSeconds: number }) {
  const urgent = remainingSeconds <= 60;
  const warning = remainingSeconds <= 300;
  return (
    <Badge
      variant={urgent ? 'destructive' : 'outline'}
      className={cn(warning && !urgent && 'border-orange-300 text-orange-700')}
    >
      <Clock className="size-3" />
      {formatDuration(remainingSeconds)}
    </Badge>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function describeAntiCheat(policy: PolicyView | null | undefined): string {
  if (!policy) return 'Copy, navigation, and fullscreen protections may be enforced.';
  const enabled = [
    policy.antiCheat.copyPasteProtection ? 'copy and paste blocking' : null,
    policy.antiCheat.tabSwitchDetection ? 'tab switch detection' : null,
    policy.antiCheat.devtoolsDetection ? 'developer tools detection' : null,
    policy.antiCheat.rightClickDisabled ? 'right-click blocking' : null,
    policy.antiCheat.fullscreenEnforced ? 'fullscreen enforcement' : null,
  ].filter(Boolean);
  return enabled.length ? `Active checks: ${enabled.join(', ')}.` : 'Attempt checks are active.';
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
