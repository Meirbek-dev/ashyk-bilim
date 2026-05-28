'use client'

import { CheckCircle2, ChevronDown, Clock, RotateCcw, XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatPercent } from '@/features/assessments/domain/score'
import type { AttemptViewModel } from '@/features/assessments/domain/view-models'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

// ── Component ─────────────────────────────────────────────────────────────────

interface AttemptResultCardProps {
  vm: AttemptViewModel
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
  onRetry,
  onNext,
  onStartRevision,
}: AttemptResultCardProps) {
  const t = useTranslations('Features.ActivityWorkspace')
  const [breakdownOpen, setBreakdownOpen] = useState(false)

  const { isResultVisible, score, isReturnedForRevision, canStartRevision, canSubmit } = vm
  const pct = score.percent
  const passing = pct !== null && pct >= 60
  const showScore = isResultVisible && pct !== null

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
              <Badge
                variant="outline"
                className="gap-1.5 border-amber-500 text-amber-600 dark:text-amber-400"
              >
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
            {showScore
              ? `${t('assessmentSubmitted')} · ${formatPercent(pct)}`
              : t('assessmentSubmitted')}
          </p>

          {vm.startedAt ? (
            <p className="text-muted-foreground text-xs">
              {t('submittedOn', { date: formatDate(vm.startedAt) })}
            </p>
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
              className={cn(
                'text-muted-foreground size-4 transition-transform',
                breakdownOpen && 'rotate-180',
              )}
            />
          </button>
          {breakdownOpen ? (
            <div className="border-border divide-border divide-y border-t text-sm">
              {vm.items.map((item, i) => (
                <div key={item.id} className="flex items-center justify-between px-4 py-2">
                  <span className="text-muted-foreground line-clamp-2 flex-1 pr-4">
                    {i + 1}. {item.title}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {item.max_score > 0 ? `/ ${item.max_score}` : '—'}
                  </span>
                </div>
              ))}
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
