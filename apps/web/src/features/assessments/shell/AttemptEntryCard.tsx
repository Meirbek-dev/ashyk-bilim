'use client'

import type { ReactNode } from 'react'
import { AlertTriangle, BookOpen, Clock, Eye, FileEdit, Layers, Lock, RotateCcw, Timer } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AttemptViewModel } from '@/features/assessments/domain/view-models'
import { isAntiCheatEnabled } from '@/features/assessments/domain/policy'
import { useTimeLimitLabel } from '@/features/assessments/shared/useTimeLimitLabel'
import { usePercentFormat } from '@/features/assessments/shared/usePercentFormat'
import { REMEDIATION_REQUIRED, RemediationGate } from '@/features/remediation'

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

interface AttemptEntryCardProps {
  vm: AttemptViewModel
  isTeacher?: boolean
  /** UX-097: the retake while the last hand-in awaits the teacher — secondary here, the bar stays neutral. */
  onStartNewAttempt?: () => void
  startPending?: boolean
}

export default function AttemptEntryCard({
  vm,
  isTeacher = false,
  onStartNewAttempt,
  startPending = false,
}: AttemptEntryCardProps) {
  const t = useTranslations('Features.ActivityWorkspace')
  const tKinds = useTranslations('Features.Assessments.Studio.kinds')
  const tReasons = useTranslations('AttemptActions.blockedReasons')
  const formatTimeLimit = useTimeLimitLabel()
  const percent = usePercentFormat()

  const { recommendedAction, policy, items } = vm
  const isBlocked = recommendedAction === 'blocked'
  const isWaiting = recommendedAction === 'waitForRelease'
  const isRevision = recommendedAction === 'startRevision'
  // Unlimited attempts + batch release: the learner may start again, but the
  // last hand-in is still awaiting the teacher — say so instead of «Готовы начать».
  // A PENDING hand-in (essay awaiting the teacher) is «received» too, even though its release state is still hidden.
  const isAwaitingRelease = vm.releaseState === 'AWAITING_RELEASE' || vm.submissionStatus === 'PENDING'

  const questionCount = items.length
  const { timeLimitSeconds } = policy
  const { maxAttempts } = policy

  if (isBlocked) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 py-10 text-center">
        <div className="bg-destructive/10 flex size-16 items-center justify-center rounded-lg">
          <Lock className="text-destructive size-8" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">{vm.title}</h2>
        {vm.disabledActionReasons.includes(REMEDIATION_REQUIRED) ? (
          <RemediationGate activityId={vm.activityUuid} />
        ) : (
          <p className="text-muted-foreground max-w-md text-sm">
            {vm.disabledActionReasons.find((r) => tReasons.has(r))
              ? tReasons(vm.disabledActionReasons.find((r) => tReasons.has(r)) as never)
              : t('assessmentBlocked')}
          </p>
        )}
      </div>
    )
  }

  if (isWaiting) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 py-10 text-center">
        <div className="bg-primary/10 flex size-16 items-center justify-center rounded-lg">
          <Timer className="text-primary size-8" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">{vm.title}</h2>
        <p className="text-muted-foreground max-w-md text-sm">{t('waitingForRelease')}</p>
      </div>
    )
  }

  const Icon = isRevision ? RotateCcw : BookOpen

  return (
    <section className="mx-auto w-full max-w-6xl py-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="bg-primary/10 flex size-12 shrink-0 items-center justify-center rounded-lg">
              <Icon className="text-primary size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  {tKinds(vm.kind)}
                </span>
                {isRevision ? (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <RotateCcw className="size-3" />
                    {t('revision')}
                  </Badge>
                ) : null}
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">{vm.title}</h2>
              {vm.description ? (
                <p className="text-muted-foreground mt-2 max-w-4xl text-sm leading-6">{vm.description}</p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              icon={<Layers className="size-4" />}
              label={t('questions')}
              value={questionCount > 0 ? String(questionCount) : '-'}
            />
            <MetricCard
              icon={<Clock className="size-4" />}
              label={t('timeLimit')}
              value={timeLimitSeconds ? formatTimeLimit(timeLimitSeconds) : t('unlimited')}
            />
            <MetricCard
              icon={<FileEdit className="size-4" />}
              label={t('attempts')}
              value={maxAttempts ? String(maxAttempts) : t('unlimited')}
            />
          </div>

          <div className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <Eye className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <div>
                <div className="text-sm font-medium">{releasePolicyTitle(policy.reviewVisibility, t)}</div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {releasePolicyDescription(policy.reviewVisibility, t)}
                </p>
              </div>
            </div>
          </div>

          {questionCount === 0 ? (
            <Alert variant="destructive" className="border-destructive/30 bg-destructive/5 text-destructive">
              <AlertTriangle className="size-4" />
              <AlertTitle>{t('testNotReadyTitle')}</AlertTitle>
              <AlertDescription>
                {isTeacher ? t('teacherNoQuestionsWarning') : t('noQuestionsWarning')}
              </AlertDescription>
            </Alert>
          ) : isAntiCheatEnabled(vm.policy.antiCheat) ? (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertDescription>{t('antiCheatNotice')}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border p-4">
            {questionCount === 0 ? (
              <>
                <div className="text-destructive text-sm font-semibold">{t('testNotReadyTitle')}</div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {isTeacher ? t('teacherNoQuestionsSidebar') : t('noQuestionsSidebar')}
                </p>
              </>
            ) : (
              <>
                <div className="text-sm font-semibold">
                  {isRevision ? t('revision') : isAwaitingRelease ? t('pendingGrade') : t('readyToStart')}
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {isAwaitingRelease ? t('waitingForRelease') : t('readyToStartSubtitle')}
                </p>
                {typeof vm.nextAttemptCapPercent === 'number' ? (
                  <p className="text-muted-foreground mt-1 text-sm" data-testid="attempt-cap-note">
                    {t('attemptCapNote', { percent: percent(vm.nextAttemptCapPercent) })}
                  </p>
                ) : null}
                {onStartNewAttempt ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    disabled={startPending}
                    onClick={onStartNewAttempt}
                    data-testid="start-new-attempt"
                  >
                    <RotateCcw className="size-4" />
                    {t('startNewAttempt')}
                  </Button>
                ) : null}
              </>
            )}
          </div>

          {policy.dueAt ? (
            <div className="rounded-lg border p-4">
              <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{t('dueDate')}</div>
              <div
                className={cn('mt-1 text-sm font-medium', new Date(policy.dueAt) < new Date() && 'text-destructive')}
              >
                {formatDate(policy.dueAt)}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  )
}

function releasePolicyTitle(reviewVisibility: string, t: ReturnType<typeof useTranslations>): string {
  if (reviewVisibility === 'NONE') return t('releaseHidden')
  if (reviewVisibility === 'SCORE_ONLY') return t('releaseScoreOnly')
  return t('releaseFull')
}

function releasePolicyDescription(reviewVisibility: string, t: ReturnType<typeof useTranslations>): string {
  if (reviewVisibility === 'NONE') return t('releaseHiddenDescription')
  if (reviewVisibility === 'SCORE_ONLY') return t('releaseScoreOnlyDescription')
  return t('releaseFullDescription')
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="bg-muted/40 flex min-h-28 flex-col justify-between rounded-lg p-4">
      <span className="text-muted-foreground">{icon}</span>
      <span className="mt-3 text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  )
}
