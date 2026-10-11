'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RotateCcw,
  Save,
  SendHorizonal,
  Timer,
} from 'lucide-react'
import type { AttemptTimerConfig } from '@/features/assessments/shared/hooks/useAttemptGuard'
import type { PolicyView } from '@/features/assessments/domain/policy'

import { DATE_TIME_LONG_OPTIONS, formatDate } from '@/lib/date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import AppLink from '@/components/ui/AppLink'
import SubmissionStatusBadge from '@/features/assessments/shared/components/SubmissionStatusBadge'
import type { SubmissionStatus } from '@/features/assessments/domain/submission-status'

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
export type AttemptSaveState = 'saved' | 'unsaved' | 'saving' | 'submitted' | 'returned' | 'error'

// ── Shell control registration ────────────────────────────────────────────────

export interface AttemptNavigationState {
  current: number
  total: number
  answered?: number
  canPrevious: boolean
  canNext: boolean
  onPrevious: () => void
  onNext: () => void
}

export interface AttemptRecoveryState {
  open: boolean
  lastSavedAt?: number | string | null
  onAccept: () => void
  onReject: () => void
}

export interface AttemptConflictState {
  open: boolean
  latestVersion: number
  latestSavedAt?: string | null
  localAnswerCount: number
  serverAnswerCount: number
  onKeepLocalVersion: () => void
  onUseServerVersion: () => void
}

/**
 * Declared by each kind module's Attempt component to wire itself into the
 * shared shell chrome and action bar.  Call `useAttemptShellControls(controls)`
 * inside the kind component; the shell picks it up via context.
 */
export interface AttemptShellRegistration {
  saveState?: AttemptSaveState
  status?: SubmissionStatus | null
  canSave?: boolean
  canSubmit?: boolean
  isSaving?: boolean
  isSubmitting?: boolean
  onSave?: () => void
  onSubmit?: () => void
  navigation?: AttemptNavigationState | null
  timer?: AttemptTimerConfig | null
  policy?: PolicyView | null
  initialViolationCount?: number
  onViolation?: (type: string, count: number) => void | Promise<void>
  onGuardAutoSubmit?: (type: string, count: number) => void
  recovery?: AttemptRecoveryState | null
  conflict?: AttemptConflictState | null
  /** i18n key for the primary CTA button label. Falls back to 'submit'. */
  primaryButtonLabelKey?: string | null
}

// ── Context & registration hook ───────────────────────────────────────────────

interface ActionBarContextValue {
  registerControls: (controls: AttemptShellRegistration) => void
  resetControls: () => void
}

export const ActionBarContext = createContext<ActionBarContextValue | null>(null)

const DEFAULT_CONTROLS: Required<
  Pick<AttemptShellRegistration, 'saveState' | 'status' | 'canSave' | 'canSubmit' | 'isSaving' | 'isSubmitting'>
> = {
  saveState: 'saved',
  status: null,
  canSave: false,
  canSubmit: false,
  isSaving: false,
  isSubmitting: false,
}

/**
 * Called inside a kind's Attempt component to register interactive controls
 * (save state, submit callback, navigation) with the shared action bar.
 */
export function useAttemptShellControls(controls: AttemptShellRegistration): void {
  const context = useContext(ActionBarContext)

  useEffect(() => {
    context?.registerControls(controls)
  }, [context, controls])

  useEffect(() => {
    if (!context) return
    return context.resetControls
  }, [context])
}

/** Returns the current registered controls. For use inside AssessmentLayout only. */
export function useActionBarState() {
  const [controls, setControls] = useState<AttemptShellRegistration>(DEFAULT_CONTROLS)

  const registerControls = useCallback((nextControls: AttemptShellRegistration) => {
    setControls(current => {
      // A registration replaces the previous one: a handler the kind dropped
      // (e.g. `onSubmit` once submitting is no longer allowed) must not linger.
      const mergedControls = { ...DEFAULT_CONTROLS, ...nextControls }
      return areAttemptShellRegistrationsEqual(current, mergedControls) ? current : mergedControls
    })
  }, [])

  const resetControls = useCallback(() => {
    setControls(current => (areAttemptShellRegistrationsEqual(current, DEFAULT_CONTROLS) ? current : DEFAULT_CONTROLS))
  }, [])

  const contextValue = useMemo<ActionBarContextValue>(
    () => ({ registerControls, resetControls }),
    [registerControls, resetControls],
  )

  return { controls, contextValue }
}

// ── Footer component ──────────────────────────────────────────────────────────

interface AssessmentActionBarProps {
  controls: AttemptShellRegistration
  returned: boolean
  primaryButtonLabelKey?: string | null
  /** The course page: the site nav is hidden mid-attempt, so this is the way out (the draft autosaves). */
  exitHref?: string
  /** Time left on a timed attempt; shown here because the bar never scrolls away. */
  remainingSeconds?: number | null
  /** Set when `remainingSeconds` counts down to a due date: until its last day the bar names the date instead. */
  dueAt?: string | null
}

/**
 * The primary button always fires `controls.onSubmit`, so the runtime's
 * recommended entry action ("Continue" / "Start") may only label it while no
 * attempt content has registered a submit handler.
 */
export function resolvePrimaryButtonLabelKey(
  controls: Pick<AttemptShellRegistration, 'primaryButtonLabelKey' | 'onSubmit'>,
  recommendedLabelKey: string | null | undefined,
): string | null {
  return controls.primaryButtonLabelKey ?? (controls.onSubmit ? null : (recommendedLabelKey ?? null))
}

/**
 * Fixed bottom action bar for all assessment attempt surfaces.
 *
 * Contains (left-to-right): save-state badge, progress counter, optional
 * Previous/Next navigation, optional "Save draft" button, primary Submit button.
 *
 * This is the ONLY place `SaveStateBadge` is rendered — no duplicate in the header.
 */
export function AssessmentActionBar({
  controls,
  returned,
  primaryButtonLabelKey,
  exitHref,
  remainingSeconds = null,
  dueAt = null,
}: AssessmentActionBarProps) {
  const t = useTranslations('Features.Assessments.Attempt.Exam')
  const tAttemptActions = useTranslations('AttemptActions')
  const tActivity = useTranslations('ActivityPage')
  const { navigation } = controls
  const locale = useLocale()
  const wordDays = (days: number, time: string) => t('timeRemainingDays', { days, time })
  // A countdown to a due date weeks away reads as pressure: «Сдать до …» until its last 24 h.
  const showDueDate = Boolean(dueAt) && remainingSeconds !== null && remainingSeconds > DUE_COUNTDOWN_SECONDS

  return (
    <div className="bg-background/95 fixed right-0 bottom-0 left-0 z-40 border-t backdrop-blur">
      <div className="mx-auto flex max-w-[96rem] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: state badge + progress counter */}
        <div className="flex flex-wrap items-center gap-2">
          {exitHref ? (
            <Button variant="ghost" size="sm" nativeButton={false} render={<AppLink href={exitHref} />}>
              <ChevronLeft className="size-4" />
              {tActivity('backToCourse')}
            </Button>
          ) : null}
          {showDueDate && dueAt ? (
            <Badge variant="outline" className="gap-1" data-testid="attempt-submit-by">
              <CalendarClock className="size-3" />
              {t('submitBy', { date: formatDate(roundToMinute(dueAt), locale, DATE_TIME_LONG_OPTIONS) })}
            </Badge>
          ) : remainingSeconds !== null ? (
            <Badge
              variant={remainingSeconds <= 60 ? 'destructive' : remainingSeconds <= 300 ? 'warning' : 'outline'}
              className="gap-1 font-mono tabular-nums"
              role="timer"
              aria-label={t('timeRemainingValue', { time: formatRemaining(remainingSeconds, wordDays) })}
            >
              <Timer className="size-3" />
              {formatRemaining(remainingSeconds, wordDays)}
            </Badge>
          ) : null}
          <SaveStateBadge
            state={returned ? 'returned' : (controls.saveState ?? 'saved')}
            status={controls.status ?? null}
          />
          {navigation ? (
            <span className="text-muted-foreground text-sm">
              {navigation.answered !== undefined ? `${t('answeredSummary', { count: navigation.answered })} · ` : ''}
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
                {t('previous')}
              </Button>
              <Button type="button" variant="outline" disabled={!navigation.canNext} onClick={navigation.onNext}>
                {t('next')}
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
              {controls.isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              {t('save')}
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
            {primaryButtonLabelKey ? tAttemptActions(primaryButtonLabelKey) : returned ? t('submitAgain') : t('submit')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Save-state badge ──────────────────────────────────────────────────────────

/**
 * Exported so kinds can use it in their own inline status display if needed,
 * but the canonical placement is AssessmentActionBar (bottom bar only).
 */
export function SaveStateBadge({ state, status }: { state: AttemptSaveState; status: SubmissionStatus | null }) {
  const t = useTranslations('Features.Assessments.Attempt.Exam')

  if (state === 'saving')
    return (
      <Badge variant="secondary">
        <LoaderCircle className="size-3 animate-spin" />
        {t('saveStateSaving')}
      </Badge>
    )
  if (state === 'unsaved') return <Badge variant="warning">{t('saveStateUnsaved')}</Badge>
  if (state === 'error') return <Badge variant="destructive">{t('saveStateError')}</Badge>
  if (state === 'returned')
    return (
      <Badge variant="warning">
        <RotateCcw className="size-3" />
        {t('saveStateReturned')}
      </Badge>
    )
  if (state === 'submitted' || status === 'PENDING') return <SubmissionStatusBadge status="PENDING" />
  if (status === 'GRADED') return <SubmissionStatusBadge status="GRADED" />
  if (status === 'PUBLISHED') return <SubmissionStatusBadge status="PUBLISHED" />
  return (
    <Badge variant="success">
      <CheckCircle2 className="size-3" />
      {t('saveStateSaved')}
    </Badge>
  )
}

function areAttemptShellRegistrationsEqual(left: AttemptShellRegistration, right: AttemptShellRegistration): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]) as Set<keyof AttemptShellRegistration>

  for (const key of keys) {
    if (!areShellRegistrationValuesEqual(left[key], right[key])) {
      return false
    }
  }

  return true
}

function areShellRegistrationValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true

  if (!isPlainRecord(left) || !isPlainRecord(right)) {
    return false
  }

  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    if (!Object.is(left[key], right[key])) {
      return false
    }
  }

  return true
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** A due-date countdown starts ticking in its last day (ROUND3-9); a time limit always ticks. */
export const DUE_COUNTDOWN_SECONDS = 86_400

/** The timer end is `fetch time + remaining seconds`; due dates are whole minutes. */
function roundToMinute(iso: string): string {
  return new Date(Math.round(new Date(iso).getTime() / 60_000) * 60_000).toISOString()
}

/**
 * "mm:ss", "h:mm:ss" from an hour up; a countdown to a strict due date can be weeks long, so from a day up
 * `days(days, "h:mm:ss")` words the whole days («2 д 3:04:05»).
 */
export function formatRemaining(seconds: number, days?: (days: number, time: string) => string): string {
  const d = days ? Math.floor(seconds / 86_400) : 0
  const rest = seconds - d * 86_400
  const h = Math.floor(rest / 3600)
  const m = Math.floor((rest % 3600) / 60)
  const s = rest % 60
  const mmss = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  const time = h > 0 || d > 0 ? `${h}:${mmss}` : mmss
  return d > 0 && days ? days(d, time) : time
}
