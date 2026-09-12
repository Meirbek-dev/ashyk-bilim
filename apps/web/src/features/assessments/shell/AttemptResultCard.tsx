'use client'

import { CheckCircle2, ChevronDown, Clock, RotateCcw, XCircle } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { localizeItemFeedback } from '@/features/grading/domain/status'
import type { AttemptViewModel } from '@/features/assessments/domain/view-models'
import type { LearnerCourseState } from '@/features/learner-course/api'

// ── Component ─────────────────────────────────────────────────────────────────

interface AttemptResultCardProps {
  vm: AttemptViewModel
  /** The progress projection's row for this activity (learner-state outline); decides passed/score. */
  activityState?: LearnerCourseState['outline'][number]['activities'][number] | undefined
  onRetry?: () => void
  onNext?: () => void
  onStartRevision?: () => void
}

/**
 * Post-submit result card.
 *
 * Shows score (when released), late-submission indicator, teacher feedback,
 * and available follow-up actions.
 *
 * Follow-up action CTAs (retry, start revision) are inside this card since
 * they are secondary actions. The BottomActionBar handles the primary
 * "Next Activity" CTA via runtime.primary_action.
 */
export default function AttemptResultCard({
  vm,
  activityState,
  onRetry,
  onNext: _onNext,
  onStartRevision,
}: AttemptResultCardProps) {
  const t = useTranslations('Features.ActivityWorkspace')
  const tGrading = useTranslations('Features.Grading')
  const format = useFormatter()
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  // One number format on the card: the breakdown already goes through
  // `format.number`, so the headline percent must too («66,67%», not «66.67%»).
  const formatPercent = (percent: number | null) =>
    percent === null ? '--' : `${format.number(percent, { maximumFractionDigits: 2 })}%`

  const { isResultVisible, score, isReturnedForRevision, canStartRevision, canSubmit } = vm
  const latestPct = score.percent
  // Headline = the projection (best submitted attempt), the same source the
  // outline sidebar ticks from; fall back to the latest attempt when absent.
  const pct = activityState?.score ?? latestPct
  const passing = activityState?.passed ?? (pct !== null && pct >= (vm.passingScore ?? 60))
  const showScore = isResultVisible && pct !== null
  const showLatest = showScore && latestPct !== null && latestPct !== pct

  return (
    <div className="mx-auto w-full max-w-2xl py-6">
      {/* Result header */}
      <div className="mb-6 flex items-center gap-4">
        <div
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-xl',
            !showScore ? 'bg-muted' : passing ? 'bg-primary/10' : 'bg-destructive/10',
          )}
        >
          {!showScore ? (
            <Clock className="text-muted-foreground size-6" />
          ) : passing ? (
            <CheckCircle2 className="text-primary size-6" />
          ) : (
            <XCircle className="text-destructive size-6" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {isReturnedForRevision ? (
              <Badge variant="outline" className="gap-1.5 border-amber-500 text-amber-600 dark:text-amber-400">
                <RotateCcw className="size-3" />
                {t('returnedForRevision')}
              </Badge>
            ) : showScore ? (
              passing ? (
                <Badge variant="outline" className="border-primary text-primary gap-1.5">
                  <CheckCircle2 className="size-3" />
                  {t('passed')}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-destructive text-destructive gap-1.5">
                  <XCircle className="size-3" />
                  {t('failed')}
                </Badge>
              )
            ) : (
              <Badge variant="secondary" className="gap-1.5">
                <Clock className="size-3" />
                {t('pendingGrade')}
              </Badge>
            )}
          </div>

          <p className="text-xl font-semibold">
            {showScore ? `${t('assessmentSubmitted')} · ${formatPercent(pct)}` : t('assessmentSubmitted')}
          </p>

          {showLatest ? (
            <p className="text-muted-foreground text-xs">{t('latestAttemptScore', { score: formatPercent(latestPct) })}</p>
          ) : null}

          {vm.startedAt ? (
            <p className="text-muted-foreground text-xs">{t('submittedOn', { date: format.dateTime(new Date(vm.startedAt), { dateStyle: 'medium', timeStyle: 'short' }) })}</p>
          ) : null}
        </div>
      </div>

      {/* Grade not released note */}
      {!showScore && !isReturnedForRevision ? (
        <p className="text-muted-foreground mb-4 text-sm">{t('gradeNotYetReleased')}</p>
      ) : null}

      {/* Per-item breakdown — collapsible, auto-graded only */}
      {showScore && vm.items.length > 0 ? (
        <div className="border-border mb-4 rounded-lg border">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
            onClick={() => setBreakdownOpen(v => !v)}
            aria-expanded={breakdownOpen}
          >
            <span>{t('breakdown')}</span>
            <ChevronDown
              className={cn('text-muted-foreground size-4 transition-transform', breakdownOpen && 'rotate-180')}
            />
          </button>
          {breakdownOpen ? (
            <div className="border-border divide-border divide-y border-t text-sm">
              {vm.items.map((item, i) => {
                const graded = vm.itemScores[item.id]
                const maxScore = graded?.max_score ?? item.max_score
                // The auto-grader's verdict (localized from `feedback_code`) or
                // the teacher's prose — the same text the teacher review shows.
                const verdict = graded ? localizeItemFeedback(graded, tGrading) : ''
                return (
                  <div key={item.id} className="flex items-center justify-between px-4 py-2">
                    <span className="min-w-0 flex-1 pr-4">
                      <span className="text-muted-foreground line-clamp-2">
                        {i + 1}. {item.title}
                      </span>
                      {verdict ? (
                        <span
                          className={cn(
                            'mt-0.5 block text-xs',
                            graded?.correct === true
                              ? 'text-primary'
                              : graded?.correct === false
                                ? 'text-destructive'
                                : 'text-muted-foreground',
                          )}
                          data-testid={`item-verdict-${item.id}`}
                        >
                          {verdict}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className="text-muted-foreground shrink-0 text-xs tabular-nums"
                      data-testid={`item-score-${item.id}`}
                    >
                      {maxScore > 0
                        ? `${graded ? format.number(graded.score) : '—'} / ${format.number(maxScore)}`
                        : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Follow-up actions (secondary — Next Activity is in BottomActionBar) */}
      <div className="flex flex-wrap gap-3">
        {canStartRevision && onStartRevision ? (
          <Button variant="default" onClick={onStartRevision}>
            <RotateCcw className="size-4" />
            {t('startRevision')}
          </Button>
        ) : null}

        {canSubmit && onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            <RotateCcw className="size-4" />
            {t('retryAssessment')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
