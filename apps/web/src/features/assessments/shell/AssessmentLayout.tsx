'use client'

import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, LoaderCircle, Maximize2, ShieldAlert } from 'lucide-react'

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
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { AttemptConflictState } from './AssessmentActionBar'
import { DEFAULT_POLICY_VIEW, isAntiCheatEnabled } from '@/features/assessments/domain/policy'
import type { AttemptViewModel } from '@/features/assessments/domain/view-models'
import { useAssessmentAttempt as useAssessmentAttemptData } from '@/features/assessments/hooks/useAssessment'
import { loadKindModule } from '@/features/assessments/registry'
import type { KindModule } from '@/features/assessments/registry'
import { useAttemptGuard } from '@/features/assessments/shared/hooks/useAttemptGuard'

import { AssessmentChrome } from './AssessmentChrome'
import { ActionBarContext, AssessmentActionBar, useActionBarState } from './AssessmentActionBar'
import type { AttemptRecoveryState } from './AssessmentActionBar'

// ── Props ─────────────────────────────────────────────────────────────────────

interface AssessmentLayoutProps {
  activityUuid: string
  courseUuid: string
  /** Pre-fetched view model. When supplied, skips the internal activity fetch. */
  vm?: AttemptViewModel
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * AssessmentLayout — the single shell that wraps every assessment attempt kind.
 *
 * Responsibilities:
 * - Loads the kind module and renders its `Attempt` slot.
 * - Applies policy enforcement (timer, anti-cheat) via `useAttemptGuard`.
 * - Renders fullscreen gate when required.
 * - Provides `ActionBarContext` so kind components can register controls.
 * - Renders `AssessmentChrome` (header) and `AssessmentActionBar` (footer).
 * - Renders the shared recovery dialog driven by kind-registered `controls.recovery`.
 *
 * Previously: `features/assessments/shared/AttemptShell.tsx`
 */
export default function AssessmentLayout({ activityUuid, courseUuid, vm: suppliedVm }: AssessmentLayoutProps) {
  const assessment = useAssessmentAttemptData(suppliedVm ? null : activityUuid)
  const resolved = suppliedVm
    ? ({ surface: 'ATTEMPT', vm: suppliedVm, kind: suppliedVm.kind } as const)
    : assessment.vm?.surface === 'ATTEMPT'
      ? assessment.vm
      : null
  const vm = resolved?.vm ?? null

  const [kindModule, setKindModule] = useState<KindModule | null>(null)
  const [isOnline, setIsOnline] = useState(true)
  const { controls, contextValue } = useActionBarState()
  const t = useTranslations('Features.Assessments.Attempt.Exam')

  // ── Load kind module ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!vm?.kind) return
    let cancelled = false
    void loadKindModule(vm.kind).then(mod => {
      if (!cancelled) setKindModule(mod)
    })
    return () => {
      cancelled = true
    }
  }, [vm?.kind])

  // ── Focus mode (persisted across page loads) ───────────────────────────────

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const update = () => setIsOnline(navigator.onLine)
    update()
    globalThis.addEventListener('online', update)
    globalThis.addEventListener('offline', update)
    return () => {
      globalThis.removeEventListener('online', update)
      globalThis.removeEventListener('offline', update)
    }
  }, [])

  // ── Policy / guard ─────────────────────────────────────────────────────────

  const policy = controls.policy ?? vm?.policy ?? null
  const antiCheatEnabled = Boolean(policy && isAntiCheatEnabled(policy.antiCheat))

  const guard = useAttemptGuard(policy ?? DEFAULT_POLICY_VIEW, {
    enabled: antiCheatEnabled,
    ...(controls.timer === undefined ? {} : { timer: controls.timer }),
    ...(controls.initialViolationCount === undefined ? {} : { initialViolationCount: controls.initialViolationCount }),
    ...(controls.onViolation === undefined ? {} : { onViolation: controls.onViolation }),
    ...(controls.onGuardAutoSubmit === undefined ? {} : { onThresholdReached: controls.onGuardAutoSubmit }),
  })

  // ── Kind component ─────────────────────────────────────────────────────────

  const AttemptContent = kindModule
    ? (kindModule.Attempt as ComponentType<{
        activityUuid: string
        courseUuid: string
        vm?: AttemptViewModel
      }>)
    : null

  // ── Derived display state ──────────────────────────────────────────────────

  const returned = vm?.isReturnedForRevision || controls.status === 'RETURNED'

  // ── Loading ────────────────────────────────────────────────────────────────

  if (assessment.isLoading || !vm || !AttemptContent) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <LoaderCircle className="text-muted-foreground size-6 animate-spin" />
      </div>
    )
  }

  // ── Code Challenge: full-viewport fixed layout ────────────────────────────
  // Code challenge needs to fill the entire viewport below the global nav
  // so Monaco + ResizablePanel can use all available space.

  if (vm.kind === 'TYPE_CODE_CHALLENGE') {
    return (
      <ActionBarContext.Provider value={contextValue}>
        {/* Full-viewport fixed shell — no scroll, fills below global nav (56px) */}
        <div className="bg-background fixed inset-x-0 top-14 bottom-0 flex flex-col">
          {/* Compact header */}
          <div className="flex h-11 shrink-0 items-center justify-between border-b px-4">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {kindModule?.label ?? 'Code Challenge'}
              </span>
              <span className="text-foreground min-w-0 truncate text-sm font-semibold">{vm.title}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {guard.remainingSeconds !== null && guard.remainingSeconds !== undefined ? (
                <span className="text-sm font-medium tabular-nums">{formatTimerDisplay(guard.remainingSeconds)}</span>
              ) : null}
            </div>
          </div>
          {/* Editor fills remaining height; pb-16 leaves space for fixed AssessmentActionBar */}
          <div className="min-h-0 flex-1 overflow-hidden pb-16">
            <AttemptContent activityUuid={vm.activityUuid} courseUuid={courseUuid} vm={vm} />
          </div>
        </div>
        <AssessmentActionBar
          controls={controls}
          returned={returned}
          primaryButtonLabelKey={controls.primaryButtonLabelKey ?? vm?.primaryButtonLabelKey ?? null}
        />
        <RecoveryDialog recovery={controls.recovery ?? null} />
        <ConflictDialog conflict={controls.conflict ?? null} />
      </ActionBarContext.Provider>
    )
  }

  return (
    <ActionBarContext.Provider value={contextValue}>
      {/* ── Security countdown overlay ────────────────────────────────── */}
      {guard.securityCountdown !== null ? (
        <div className="bg-destructive/95 animate-fade-in fixed inset-0 z-50 flex items-center justify-center p-4 text-white backdrop-blur-md">
          <div className="bg-card text-card-foreground border-destructive/50 w-full max-w-md rounded-lg border p-6 shadow-2xl">
            <div className="text-destructive flex items-center gap-3 text-lg font-semibold">
              <ShieldAlert className="size-6 animate-pulse" />
              {t('securityViolationAlertTitle', {
                defaultValue: 'Security Violation Detected',
              })}
            </div>
            <p className="text-muted-foreground mt-3 text-sm">
              {t('securityViolationAlertDescription', {
                defaultValue:
                  'Please return focus to the exam window immediately. Failure to comply will result in automatic submission of your exam.',
              })}
            </p>
            <div className="my-6 flex flex-col items-center justify-center gap-2">
              <span className="text-destructive animate-pulse text-6xl font-extrabold tracking-tighter tabular-nums">
                {guard.securityCountdown}
              </span>
              <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                {t('secondsRemaining', { defaultValue: 'seconds remaining' })}
              </span>
            </div>
            {policy?.antiCheat.fullscreenEnforced && !guard.isFullscreen ? (
              <Button type="button" variant="destructive" className="mt-2 w-full" onClick={guard.requestFullscreen}>
                <Maximize2 className="size-4" />
                {t('reEnterFullscreen', { defaultValue: 'Re-enter Fullscreen' })}
              </Button>
            ) : (
              <p className="text-muted-foreground animate-pulse text-center text-xs">
                {t('clickBackToResume', {
                  defaultValue: 'Click back or refocus to resume.',
                })}
              </p>
            )}
          </div>
        </div>
      ) : null}

      {/* ── Fullscreen gate ─────────────────────────────────────────────── */}
      {guard.fullscreenGateOpen && guard.securityCountdown === null ? (
        <div className="bg-background/95 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md rounded-lg border p-6 shadow-lg">
            <div className="flex items-center gap-3 text-lg font-semibold">
              <Maximize2 className="size-5" />
              {t('fullscreenRequired')}
            </div>
            <p className="text-muted-foreground mt-2 text-sm">{t('fullscreenRequiredDescription')}</p>
            {guard.fullscreenError ? (
              <p className="text-muted-foreground mt-3 text-sm">{guard.fullscreenError}</p>
            ) : null}
            <Button type="button" className="mt-5 w-full" onClick={guard.requestFullscreen}>
              <Maximize2 className="size-4" />
              {t('enterFullscreen')}
            </Button>
          </div>
        </div>
      ) : null}

      {/* ── Main layout ─────────────────────────────────────────────────── */}
      <div className="bg-background pb-28">
        <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4">
          <AssessmentChrome
            kindLabel={kindModule?.label ?? 'Assessment'}
            title={vm.title}
            description={vm.description}
            dueAt={vm.dueAt}
            returned={returned}
            timerSeconds={guard.remainingSeconds}
            antiCheatEnabled={antiCheatEnabled}
            violationCount={guard.violationCount}
            policy={policy}
            releaseState={vm.releaseState}
            submissionStatus={controls.status ?? vm.submissionStatus}
            isResultVisible={vm.isResultVisible}
          />

          {!isOnline ? (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertTitle>{t('connectionLostTitle')}</AlertTitle>
              <AlertDescription>{t('connectionLostDescription')}</AlertDescription>
            </Alert>
          ) : null}

          <main className="min-h-[420px]">
            <AttemptContent activityUuid={vm.activityUuid} courseUuid={courseUuid} vm={vm} />
          </main>
        </div>

        <AssessmentActionBar
          controls={controls}
          returned={returned}
          primaryButtonLabelKey={controls.primaryButtonLabelKey ?? vm?.primaryButtonLabelKey ?? null}
        />
      </div>

      {/* ── Recovery dialog (driven by kind controls) ───────────────────── */}
      <RecoveryDialog recovery={controls.recovery ?? null} />
      <ConflictDialog conflict={controls.conflict ?? null} />
    </ActionBarContext.Provider>
  )
}

// ── Recovery dialog ───────────────────────────────────────────────────────────

function RecoveryDialog({ recovery }: { recovery: AttemptRecoveryState | null }) {
  const t = useTranslations('Features.Assessments.Attempt.Exam')
  return (
    <AlertDialog open={Boolean(recovery?.open)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <AlertTriangle className="size-6 text-orange-500" />
          </AlertDialogMedia>
          <AlertDialogTitle>{t('recoverPreviousAnswers')}</AlertDialogTitle>
          <AlertDialogDescription>
            {recovery?.lastSavedAt
              ? t('recoverLocalDraftWithTime', {
                  time: formatDate(recovery.lastSavedAt),
                })
              : t('recoverLocalDraft')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={recovery?.onReject}>{t('startFresh')}</AlertDialogCancel>
          <AlertDialogAction onClick={recovery?.onAccept}>{t('recoverAnswers')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ConflictDialog({ conflict }: { conflict: AttemptConflictState | null }) {
  const t = useTranslations('Features.Assessments.Attempt.Exam')
  return (
    <AlertDialog open={Boolean(conflict?.open)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <AlertTriangle className="size-6 text-orange-500" />
          </AlertDialogMedia>
          <AlertDialogTitle>{t('resolveDraftConflict')}</AlertDialogTitle>
          <AlertDialogDescription>
            {conflict
              ? t('draftConflictDescription', {
                  latestVersion: conflict.latestVersion,
                  latestSavedAt: conflict.latestSavedAt ? formatDate(conflict.latestSavedAt) : '',
                })
              : t('draftConflictAvailable')}
          </AlertDialogDescription>
          {conflict ? (
            <AlertDialogDescription>
              {t('draftConflictAnswerCounts', {
                localCount: conflict.localAnswerCount,
                serverCount: conflict.serverAnswerCount,
              })}
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={conflict?.onKeepLocalVersion}>{t('keepMyLocalVersion')}</AlertDialogCancel>
          <AlertDialogAction onClick={conflict?.onUseServerVersion}>{t('useLatestSavedVersion')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function formatDate(value: string | number): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatTimerDisplay(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
