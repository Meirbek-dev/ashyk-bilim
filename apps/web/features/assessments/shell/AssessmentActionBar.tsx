'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RotateCcw,
  Save,
  SendHorizonal,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SubmissionStatus } from '@/features/assessments/domain/submission-status';

// ── Save-state type ───────────────────────────────────────────────────────────

/**
 * Unified save-state discriminant used across all kind modules.
 *
 * - `saved`     — all changes are persisted (server or localStorage).
 * - `unsaved`   — user has made changes not yet persisted.
 * - `saving`    — a persist request is in flight.
 * - `submitted` — the attempt has been submitted for grading.
 * - `returned`  — teacher returned the submission for revision.
 * - `error`     — last save request failed.
 */
export type AttemptSaveState = 'saved' | 'unsaved' | 'saving' | 'submitted' | 'returned' | 'error';

// ── Shell control registration ────────────────────────────────────────────────

export interface AttemptNavigationState {
  current: number;
  total: number;
  answered?: number;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

export interface AttemptRecoveryState {
  open: boolean;
  lastSavedAt?: number | string | null;
  onAccept: () => void;
  onReject: () => void;
}

import type { AttemptTimerConfig } from '@/features/assessments/shared/hooks/useAttemptGuard';
import type { PolicyView } from '@/features/assessments/domain/policy';

/**
 * Declared by each kind module's Attempt component to wire itself into the
 * shared shell chrome and action bar.  Call `useAttemptShellControls(controls)`
 * inside the kind component; the shell picks it up via context.
 */
export interface AttemptShellRegistration {
  saveState?: AttemptSaveState;
  status?: SubmissionStatus | null;
  canSave?: boolean;
  canSubmit?: boolean;
  isSaving?: boolean;
  isSubmitting?: boolean;
  onSave?: () => void;
  onSubmit?: () => void;
  navigation?: AttemptNavigationState | null;
  timer?: AttemptTimerConfig | null;
  policy?: PolicyView | null;
  initialViolationCount?: number;
  onViolation?: (type: string, count: number) => void | Promise<void>;
  onGuardAutoSubmit?: (type: string, count: number) => void;
  recovery?: AttemptRecoveryState | null;
}

// ── Context & registration hook ───────────────────────────────────────────────

interface ActionBarContextValue {
  registerControls: (controls: AttemptShellRegistration) => () => void;
}

export const ActionBarContext = createContext<ActionBarContextValue | null>(null);

const DEFAULT_CONTROLS: Required<
  Pick<AttemptShellRegistration, 'saveState' | 'status' | 'canSave' | 'canSubmit' | 'isSaving' | 'isSubmitting'>
> = {
  saveState: 'saved',
  status: null,
  canSave: false,
  canSubmit: false,
  isSaving: false,
  isSubmitting: false,
};

/**
 * Called inside a kind's Attempt component to register interactive controls
 * (save state, submit callback, navigation) with the shared action bar.
 */
export function useAttemptShellControls(controls: AttemptShellRegistration): void {
  const context = useContext(ActionBarContext);
  useEffect(() => {
    if (!context) return;
    return context.registerControls(controls);
  }, [context, controls]);
}

/** Returns the current registered controls. For use inside AssessmentLayout only. */
export function useActionBarState() {
  const [controls, setControls] = useState<AttemptShellRegistration>(DEFAULT_CONTROLS);

  const registerControls = useCallback((nextControls: AttemptShellRegistration) => {
    setControls((current) => ({ ...current, ...nextControls }));
    return () => {
      setControls(DEFAULT_CONTROLS);
    };
  }, []);

  const contextValue = useMemo<ActionBarContextValue>(() => ({ registerControls }), [registerControls]);

  return { controls, contextValue };
}

// ── Footer component ──────────────────────────────────────────────────────────

interface AssessmentActionBarProps {
  controls: AttemptShellRegistration;
  returned: boolean;
}

/**
 * Fixed bottom action bar for all assessment attempt surfaces.
 *
 * Contains (left-to-right): save-state badge, progress counter, optional
 * Previous/Next navigation, optional "Save draft" button, primary Submit button.
 *
 * This is the ONLY place `SaveStateBadge` is rendered — no duplicate in the header.
 */
export function AssessmentActionBar({ controls, returned }: AssessmentActionBarProps) {
  const navigation = controls.navigation;

  return (
    <div className="bg-background/95 fixed right-0 bottom-0 left-0 z-40 border-t backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: state badge + progress counter */}
        <div className="flex flex-wrap items-center gap-2">
          <SaveStateBadge
            state={returned ? 'returned' : (controls.saveState ?? 'saved')}
            status={controls.status ?? null}
          />
          {navigation ? (
            <span className="text-muted-foreground text-sm">
              {navigation.answered !== undefined ? `${navigation.answered} answered · ` : ''}
              {navigation.current} / {navigation.total}
            </span>
          ) : null}
        </div>

        {/* Right: navigation + action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {navigation ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={!navigation.canPrevious}
                onClick={navigation.onPrevious}
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!navigation.canNext}
                onClick={navigation.onNext}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </>
          ) : null}

          {controls.onSave ? (
            <Button
              type="button"
              variant="outline"
              disabled={!controls.canSave || controls.isSaving || controls.isSubmitting}
              onClick={controls.onSave}
            >
              {controls.isSaving ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save draft
            </Button>
          ) : null}

          <Button
            type="button"
            disabled={!controls.canSubmit || controls.isSaving || controls.isSubmitting || !controls.onSubmit}
            onClick={controls.onSubmit}
          >
            {controls.isSubmitting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <SendHorizonal className="size-4" />
            )}
            {returned ? 'Submit again' : 'Submit'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Save-state badge ──────────────────────────────────────────────────────────

/**
 * Exported so kinds can use it in their own inline status display if needed,
 * but the canonical placement is AssessmentActionBar (bottom bar only).
 */
export function SaveStateBadge({
  state,
  status,
}: {
  state: AttemptSaveState;
  status: SubmissionStatus | null;
}) {
  if (state === 'saving')
    return (
      <Badge variant="secondary">
        <LoaderCircle className="size-3 animate-spin" />
        Saving
      </Badge>
    );
  if (state === 'unsaved') return <Badge variant="warning">Unsaved</Badge>;
  if (state === 'error') return <Badge variant="destructive">Save failed</Badge>;
  if (state === 'returned')
    return (
      <Badge variant="warning">
        <RotateCcw className="size-3" />
        Returned
      </Badge>
    );
  if (state === 'submitted' || status === 'PENDING')
    return (
      <Badge variant="secondary">
        <CheckCircle2 className="size-3" />
        Submitted
      </Badge>
    );
  if (status === 'GRADED') return <Badge variant="secondary">Awaiting grade</Badge>;
  if (status === 'PUBLISHED') return <Badge variant="success">Released</Badge>;
  return (
    <Badge variant="success">
      <CheckCircle2 className="size-3" />
      Saved
    </Badge>
  );
}
