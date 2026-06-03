'use client'

import { AlertTriangle, Clock, RotateCcw } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { TimerRing } from './TimerRing'
import { useTranslations } from 'next-intl'
import type { PolicyView } from '@/features/assessments/domain/policy'
import type { ReleaseState } from '@/features/assessments/domain/release'
import type { SubmissionStatus } from '@/features/assessments/domain/submission-status'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AssessmentChromeProps {
  /** Assessment kind label shown above the title (e.g. "Exam"). */
  kindLabel: string
  title: string
  description?: string | null
  /** ISO date string or null. */
  dueAt?: string | null
  /** Whether this attempt was returned for revision. */
  returned?: boolean
  /** Remaining seconds for a timed assessment. `null` = no timer. */
  timerSeconds?: number | null
  /** Whether anti-cheat checks are active. */
  antiCheatEnabled?: boolean
  /** Number of recorded violations (shown when > 0). */
  violationCount?: number
  /** Full policy view, used to describe which checks are active. */
  policy?: PolicyView | null
  releaseState?: ReleaseState
  submissionStatus?: SubmissionStatus | null
  isResultVisible?: boolean
  className?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * The header card for every assessment attempt surface.
 *
 * Renders the kind label, title, description, due-date badge, timer badge,
 * returned-for-revision alert, and anti-cheat notice.
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
  timerSeconds = null,
  antiCheatEnabled = false,
  violationCount = 0,
  policy,
  releaseState,
  submissionStatus = null,
  isResultVisible = false,
  className,
}: AssessmentChromeProps) {
  const t = useTranslations('Features.Assessments.Attempt.Exam')
  const releaseNotice = getReleaseNotice(
    releaseState === undefined
      ? {
          submissionStatus,
          returned,
          isResultVisible,
          t,
        }
      : {
          releaseState,
          submissionStatus,
          returned,
          isResultVisible,
          t,
        },
  )

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* ── Title card ────────────────────────────────────────────────────── */}
      <header className="bg-card rounded-lg border px-4 py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="text-muted-foreground text-xs font-medium uppercase">{kindLabel}</div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">{title}</h1>
            {description ? <p className="text-muted-foreground mt-1 max-w-4xl text-sm">{description}</p> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {timerSeconds !== null ? <TimerRing remainingSeconds={timerSeconds} /> : null}
            {dueAt ? (
              <Badge variant="outline">
                <Clock className="size-3" />
                {t('dueLabel')} {formatDate(dueAt)}
              </Badge>
            ) : null}
          </div>
        </div>
      </header>

      {/* ── Returned-for-revision notice ──────────────────────────────────── */}
      {returned ? (
        <Alert>
          <RotateCcw className="size-4" />
          <AlertTitle>{t('returnedForRevisionTitle')}</AlertTitle>
          <AlertDescription>{t('returnedForRevisionDescription')}</AlertDescription>
        </Alert>
      ) : null}

      {releaseNotice ? (
        <Alert>
          <Clock className="size-4" />
          <AlertTitle>{releaseNotice.title}</AlertTitle>
          <AlertDescription>{releaseNotice.description}</AlertDescription>
        </Alert>
      ) : null}

      {/* ── Anti-cheat notice ─────────────────────────────────────────────── */}
      {antiCheatEnabled ? (
        <Alert variant={violationCount > 0 ? 'destructive' : 'default'}>
          <AlertTriangle className="size-4" />
          <AlertTitle>{t('attemptIntegrityChecksActive')}</AlertTitle>
          <AlertDescription>
            {describeAntiCheat(policy, t)}
            {violationCount > 0 ? ' ' + t('violationsRecorded', { count: violationCount }) : ''}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function describeAntiCheat(policy: PolicyView | null | undefined, t: AppTranslator): string {
  if (!policy) return t('antiCheatDefaultNotice')
  const enabled = [
    policy.antiCheat.copyPasteProtection ? t('antiCheatCopyPaste') : null,
    policy.antiCheat.tabSwitchDetection ? t('antiCheatTabSwitch') : null,
    policy.antiCheat.devtoolsDetection ? t('antiCheatDevTools') : null,
    policy.antiCheat.rightClickDisabled ? t('antiCheatRightClick') : null,
    policy.antiCheat.fullscreenEnforced ? t('antiCheatFullscreen') : null,
  ].filter(Boolean)
  return enabled.length ? t('antiCheatActiveChecks', { checks: enabled.join(', ') }) : t('antiCheatActiveNotice')
}

function getReleaseNotice({
  releaseState,
  submissionStatus,
  returned,
  isResultVisible,
  t,
}: {
  releaseState?: ReleaseState
  submissionStatus: SubmissionStatus | null
  returned: boolean
  isResultVisible: boolean
  t: (key: string) => string
}): { title: string; description: string } | null {
  if (returned || !submissionStatus) {
    return null
  }

  if (releaseState === 'AWAITING_RELEASE' || submissionStatus === 'GRADED') {
    return {
      title: t('resultsAwaitingReleaseTitle'),
      description: t('resultsAwaitingReleaseDescription'),
    }
  }

  if (releaseState === 'HIDDEN' && submissionStatus === 'PENDING') {
    return {
      title: t('submissionReceivedTitle'),
      description: t('submissionReceivedDescription'),
    }
  }

  if (releaseState === 'VISIBLE' && isResultVisible) {
    return {
      title: t('resultsAvailableTitle'),
      description: t('resultsAvailableDescription'),
    }
  }

  return null
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}
