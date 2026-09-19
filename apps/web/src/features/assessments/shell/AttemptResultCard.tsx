'use client'

import { CheckCircle2, ChevronDown, Clock, RotateCcw, XCircle } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MarkdownContent } from '@/features/content-markdown'
import { localizeItemFeedback } from '@/features/grading/domain/status'
import { answerLines } from '@/features/assessments/domain/answer-lines'
import type { AttemptViewModel } from '@/features/assessments/domain/view-models'
import type { LearnerCourseState } from '@/features/learner-course/api'
import { usePercentFormat } from '@/features/assessments/shared/usePercentFormat'
import { REMEDIATION_REQUIRED, RemediationGate } from '@/features/remediation'

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
  const percent = usePercentFormat()
  const formatPercent = (value: number | null) => (value === null ? '--' : percent(value))

  const { isResultVisible, score, isReturnedForRevision, canStartRevision, canSubmit } = vm
  const latestPct = score.percent
  // Headline = the projection (best submitted attempt), the same source the
  // outline sidebar ticks from; fall back to the latest attempt when absent.
  const pct = activityState?.score ?? latestPct
  const passing = activityState?.passed ?? (pct !== null && pct >= (vm.passingScore ?? 60))
  const showScore = isResultVisible && pct !== null
  const showLatest = showScore && latestPct !== null && latestPct !== pct
  // UX-116: the review follows the grade-of-record attempt (the one the
  // projection scored), not the latest; a switcher reaches the others.
  const reviews = vm.attemptReviews ?? []
  const recordAttempt = reviews.find(r => r.percent === pct) ?? reviews[0] ?? null
  const [selectedAttempt, setSelectedAttempt] = useState<number | null>(null)
  const shown = reviews.find(r => r.attemptNumber === selectedAttempt) ?? recordAttempt
  const itemScores = shown ? shown.itemScores : vm.itemScores
  const generalFeedback = shown ? shown.generalFeedback : vm.generalFeedback
  const annulled = shown ? shown.annulled : vm.autoSubmitReason === 'integrity_violation'

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
            <p className="text-muted-foreground text-xs">
              {t('latestAttemptScore', { score: formatPercent(latestPct) })}
            </p>
          ) : null}
          {showScore && recordAttempt && recordAttempt !== reviews[0] ? (
            <p className="text-muted-foreground text-xs" data-testid="record-attempt">
              {t('recordAttempt', { attempt: recordAttempt.attemptNumber, score: formatPercent(recordAttempt.percent) })}
            </p>
          ) : null}

          {vm.startedAt ? (
            <p className="text-muted-foreground text-xs">
              {t('submittedOn', {
                date: format.dateTime(new Date(vm.startedAt), { dateStyle: 'medium', timeStyle: 'short' }),
              })}
            </p>
          ) : null}
        </div>
      </div>

      {/* Grade not released note */}
      {!showScore && !isReturnedForRevision ? (
        <p className="text-muted-foreground mb-4 text-sm">{t('gradeNotYetReleased')}</p>
      ) : null}

      {/* UX-060: why the number is not the breakdown sum — auto-submit, late penalty, attempt cap. */}
      {vm.autoSubmitReason || vm.latePenaltyPct !== null || vm.attemptCapPercent !== null ? (
        <ul className="text-muted-foreground mb-4 space-y-1 text-sm" data-testid="score-adjustments">
          {vm.autoSubmitReason ? (
            <li>{t(vm.autoSubmitReason === 'time_expired' ? 'autoSubmittedTimeExpired' : 'autoSubmittedViolation')}</li>
          ) : null}
          {vm.latePenaltyPct !== null ? (
            <li>{t('latePenaltyApplied', { percent: percent(vm.latePenaltyPct) })}</li>
          ) : null}
          {vm.attemptCapPercent !== null ? (
            <li>{t('attemptCapApplied', { percent: percent(vm.attemptCapPercent) })}</li>
          ) : null}
        </ul>
      ) : null}

      {/* UX-116: which released attempt the feedback and breakdown below belong to. */}
      {showScore && reviews.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t('attemptSwitcher')}>
          {reviews.map(review => (
            <Button
              key={review.attemptNumber}
              type="button"
              size="sm"
              variant={review === shown ? 'secondary' : 'outline'}
              aria-pressed={review === shown}
              onClick={() => setSelectedAttempt(review.attemptNumber)}
            >
              {t('attemptTab', { attempt: review.attemptNumber, score: formatPercent(review.percent) })}
            </Button>
          ))}
        </div>
      ) : null}

      {/* UX-063: the teacher's overall comment, next to the per-item prose. */}
      {generalFeedback ? (
        <div className="border-border mb-4 rounded-lg border px-4 py-3 text-sm" data-testid="general-feedback">
          <p className="text-muted-foreground mb-1 text-xs font-medium">{t('teacherFeedback')}</p>
          {/* UX-115: the teacher writes Markdown (tables, emphasis) — render it like the file result does. */}
          <MarkdownContent content={generalFeedback} mode="compactRichText" />
        </div>
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
          {breakdownOpen && annulled ? (
            // UX-116: an annulled attempt's items are not verdicts — its score is 0 by rule.
            <p className="text-muted-foreground border-border border-t px-4 py-3 text-sm" data-testid="attempt-annulled">
              {t('attemptAnnulled')}
            </p>
          ) : breakdownOpen ? (
            <div className="border-border divide-border divide-y border-t text-sm">
              {vm.items.map((item, i) => {
                const graded = itemScores[item.id]
                // The wire breakdown is the item's share of 100; show it in the
                // item's own points — the «10 баллов» the attempt card named (UX-035).
                const maxScore = item.max_score
                const earned = graded && graded.max_score > 0 ? (graded.score / graded.max_score) * maxScore : null
                // The auto-grader's verdict (localized from `feedback_code`) or
                // the teacher's prose — the same text the teacher review shows.
                const verdict = graded ? localizeItemFeedback(graded, tGrading) : ''
                // UX-088: under `review_visibility: full` the wire carries the answers — print them.
                const userAnswer = graded ? answerLines(item, graded.user_answer) : []
                const correctAnswer = graded ? answerLines(item, graded.correct_answer) : []
                return (
                  <div key={item.id} className="flex items-center justify-between px-4 py-2">
                    <span className="min-w-0 flex-1 pr-4">
                      <span className="text-muted-foreground line-clamp-2">
                        {i + 1}. {item.title}
                      </span>
                      {userAnswer.length > 0 ? (
                        <span
                          className="mt-0.5 block text-xs whitespace-pre-wrap"
                          data-testid={`item-answer-${item.id}`}
                        >
                          {t('yourAnswer')}: {userAnswer.join('; ')}
                        </span>
                      ) : null}
                      {correctAnswer.length > 0 && graded?.correct !== true ? (
                        <span
                          className="text-muted-foreground mt-0.5 block text-xs whitespace-pre-wrap"
                          data-testid={`item-correct-answer-${item.id}`}
                        >
                          {t('correctAnswer')}: {correctAnswer.join('; ')}
                        </span>
                      ) : null}
                      {verdict && !graded?.feedback_code ? (
                        // The teacher's own prose is Markdown (UX-115); auto verdicts stay coloured one-liners.
                        <span className="mt-0.5 block text-xs" data-testid={`item-verdict-${item.id}`}>
                          <MarkdownContent content={verdict} mode="compactRichText" />
                        </span>
                      ) : verdict ? (
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
                        ? `${earned === null ? '—' : format.number(earned, { maximumFractionDigits: 2 })} / ${format.number(maxScore, { maximumFractionDigits: 2 })}`
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
      {/* BUG-152: a gate-mode remediation blocks the retake — say so and open it here. */}
      {!canSubmit && vm.disabledActionReasons.includes(REMEDIATION_REQUIRED) ? (
        <RemediationGate activityId={vm.activityUuid} />
      ) : null}
      {/* UX-034: a capped retake says so before the learner spends the attempt. */}
      {canSubmit && onRetry && typeof vm.nextAttemptCapPercent === 'number' ? (
        <p className="text-muted-foreground mt-2 text-xs" data-testid="attempt-cap-note">
          {t('attemptCapNote', { percent: percent(vm.nextAttemptCapPercent) })}
        </p>
      ) : null}
    </div>
  )
}
