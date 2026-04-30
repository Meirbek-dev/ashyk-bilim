'use client';

import {
  type ComponentType,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { AlertTriangle, LoaderCircle, Maximize2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DEFAULT_POLICY_VIEW, isAntiCheatEnabled } from '@/features/assessments/domain/policy';
import type { AttemptViewModel } from '@/features/assessments/domain/view-models';
import { useAssessmentAttempt as useAssessmentAttemptData } from '@/features/assessments/hooks/useAssessment';
import { loadKindModule, type KindModule } from '@/features/assessments/registry';
import { useAttemptGuard } from '@/features/assessments/shared/hooks/useAttemptGuard';

import { AssessmentChrome } from './AssessmentChrome';
import {
  ActionBarContext,
  AssessmentActionBar,
  useActionBarState,
} from './AssessmentActionBar';
import type { AttemptRecoveryState } from './AssessmentActionBar';

// ── Props ─────────────────────────────────────────────────────────────────────

interface AssessmentLayoutProps {
  activityUuid: string;
  courseUuid: string;
  /** Pre-fetched view model. When supplied, skips the internal activity fetch. */
  vm?: AttemptViewModel;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * AssessmentLayout — the single shell that wraps every assessment attempt kind.
 *
 * Responsibilities:
 * - Loads the kind module and renders its `Attempt` slot.
 * - Owns focus-mode state.
 * - Applies policy enforcement (timer, anti-cheat) via `useAttemptGuard`.
 * - Renders fullscreen gate when required.
 * - Provides `ActionBarContext` so kind components can register controls.
 * - Renders `AssessmentChrome` (header) and `AssessmentActionBar` (footer).
 * - Renders the shared recovery dialog driven by kind-registered `controls.recovery`.
 *
 * Previously: `features/assessments/shared/AttemptShell.tsx`
 */
export default function AssessmentLayout({ activityUuid, courseUuid, vm: suppliedVm }: AssessmentLayoutProps) {
  const assessment = useAssessmentAttemptData(suppliedVm ? null : activityUuid);
  const resolved = suppliedVm
    ? ({ surface: 'ATTEMPT', vm: suppliedVm, kind: suppliedVm.kind } as const)
    : assessment.vm?.surface === 'ATTEMPT'
      ? assessment.vm
      : null;
  const vm = resolved?.vm ?? null;

  const [kindModule, setKindModule] = useState<KindModule | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const { controls, contextValue } = useActionBarState();

  // ── Load kind module ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!vm?.kind) return;
    let cancelled = false;
    void loadKindModule(vm.kind).then((mod) => {
      if (!cancelled) setKindModule(mod);
    });
    return () => {
      cancelled = true;
    };
  }, [vm?.kind]);

  // ── Focus mode (persisted across page loads) ───────────────────────────────

  useEffect(() => {
    const stored = globalThis.localStorage?.getItem('activity-focus-mode');
    setFocusMode(stored === 'true');
  }, []);

  const toggleFocusMode = useCallback(() => {
    setFocusMode((prev) => {
      const next = !prev;
      globalThis.localStorage?.setItem('activity-focus-mode', String(next));
      globalThis.dispatchEvent?.(new CustomEvent('focusModeChange', { detail: { enabled: next } }));
      return next;
    });
  }, []);

  // ── Policy / guard ─────────────────────────────────────────────────────────

  const policy = controls.policy ?? vm?.policy ?? null;
  const antiCheatEnabled = Boolean(policy && isAntiCheatEnabled(policy.antiCheat));

  const guard = useAttemptGuard(policy ?? DEFAULT_POLICY_VIEW, {
    enabled: antiCheatEnabled,
    timer: controls.timer,
    initialViolationCount: controls.initialViolationCount,
    onViolation: controls.onViolation,
    onThresholdReached: controls.onGuardAutoSubmit,
  });

  // ── Kind component ─────────────────────────────────────────────────────────

  const AttemptContent = kindModule
    ? (kindModule.Attempt as ComponentType<{
        activityUuid: string;
        courseUuid: string;
        vm?: AttemptViewModel;
      }>)
    : null;

  // ── Derived display state ──────────────────────────────────────────────────

  const returned = Boolean(vm?.isReturnedForRevision || controls.status === 'RETURNED');

  // ── Loading ────────────────────────────────────────────────────────────────

  if (assessment.isLoading || !vm || !AttemptContent) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <LoaderCircle className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  return (
    <ActionBarContext.Provider value={contextValue}>
      {/* ── Fullscreen gate ─────────────────────────────────────────────── */}
      {guard.fullscreenGateOpen ? (
        <div className="bg-background/95 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md rounded-lg border p-6 shadow-lg">
            <div className="flex items-center gap-3 text-lg font-semibold">
              <Maximize2 className="size-5" />
              Fullscreen required
            </div>
            <p className="text-muted-foreground mt-2 text-sm">
              This attempt requires fullscreen mode. Enter fullscreen to continue.
            </p>
            {guard.fullscreenError ? (
              <p className="text-muted-foreground mt-3 text-sm">{guard.fullscreenError}</p>
            ) : null}
            <Button
              type="button"
              className="mt-5 w-full"
              onClick={guard.requestFullscreen}
            >
              <Maximize2 className="size-4" />
              Enter fullscreen
            </Button>
          </div>
        </div>
      ) : null}

      {/* ── Main layout ─────────────────────────────────────────────────── */}
      <div className={cn('min-h-screen bg-background pb-28', focusMode && 'fixed inset-0 z-40 overflow-auto')}>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5">
          <AssessmentChrome
            kindLabel={kindModule?.label ?? 'Assessment'}
            title={vm.title}
            description={vm.description}
            dueAt={vm.dueAt}
            returned={returned}
            focusMode={focusMode}
            onToggleFocusMode={toggleFocusMode}
            timerSeconds={guard.remainingSeconds}
            antiCheatEnabled={antiCheatEnabled}
            violationCount={guard.violationCount}
            policy={policy}
          />

          <main className="min-h-[420px]">
            <AttemptContent
              activityUuid={vm.activityUuid}
              courseUuid={courseUuid}
              vm={vm}
            />
          </main>
        </div>

        <AssessmentActionBar
          controls={controls}
          returned={returned}
        />
      </div>

      {/* ── Recovery dialog (driven by kind controls) ───────────────────── */}
      <RecoveryDialog recovery={controls.recovery ?? null} />
    </ActionBarContext.Provider>
  );
}

// ── Recovery dialog ───────────────────────────────────────────────────────────

function RecoveryDialog({ recovery }: { recovery: AttemptRecoveryState | null }) {
  return (
    <AlertDialog open={Boolean(recovery?.open)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <AlertTriangle className="size-6 text-orange-500" />
          </AlertDialogMedia>
          <AlertDialogTitle>Recover previous answers?</AlertDialogTitle>
          <AlertDialogDescription>
            {recovery?.lastSavedAt
              ? `A local draft from ${formatDate(recovery.lastSavedAt)} is available.`
              : 'A local draft is available for this attempt.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={recovery?.onReject}>Start fresh</AlertDialogCancel>
          <AlertDialogAction onClick={recovery?.onAccept}>Recover answers</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function formatDate(value: string | number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
