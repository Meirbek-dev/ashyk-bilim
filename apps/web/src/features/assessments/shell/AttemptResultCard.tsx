'use client';

import { CheckCircle2, ChevronRight, Clock, RotateCcw, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatPercent } from '@/features/assessments/domain/score';
import type { AttemptViewModel } from '@/features/assessments/domain/view-models';

// ── Component ─────────────────────────────────────────────────────────────────

interface AttemptResultCardProps {
  vm: AttemptViewModel;
  onRetry?: () => void;
  onNext?: () => void;
  onStartRevision?: () => void;
  isPending?: boolean;
}

/**
 * Post-submit result card.
 * Shows score (when released), late-submission indicator, and available follow-up actions.
 */
export default function AttemptResultCard({
  vm,
  onRetry,
  onNext,
  onStartRevision,
  isPending = false,
}: AttemptResultCardProps) {
  const t = useTranslations('Features.ActivityWorkspace');

  const { isResultVisible, score, isReturnedForRevision, canStartRevision, canSubmit } = vm;
  const pct = score.percent;
  const passing = pct !== null && pct >= 60;
  const showScore = isResultVisible && pct !== null;

  return (
    <div className="mx-auto flex min-h-[28rem] w-full max-w-2xl flex-col items-center justify-center gap-6 py-10">
      {/* Score circle */}
      <div
        className={cn(
          'flex size-24 items-center justify-center rounded-full border-4 text-2xl font-bold tabular-nums',
          !showScore
            ? 'border-muted-foreground/30 text-muted-foreground'
            : passing
              ? 'border-primary text-primary'
              : 'border-destructive text-destructive',
        )}
      >
        {showScore ? formatPercent(pct) : '—'}
      </div>

      {/* Status */}
      <div className="space-y-2 text-center">
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
            <Badge
              variant="outline"
              className="border-primary text-primary gap-1.5"
            >
              <CheckCircle2 className="size-3" />
              {t('passed')}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1.5 border-destructive text-destructive"
            >
              <XCircle className="size-3" />
              {t('failed')}
            </Badge>
          )
        ) : (
          <Badge
            variant="secondary"
            className="gap-1.5"
          >
            <Clock className="size-3" />
            {t('pendingGrade')}
          </Badge>
        )}

        <h2 className="text-xl font-semibold">{t('assessmentSubmitted')}</h2>

        {!showScore ? (
          <p className="text-muted-foreground max-w-sm text-sm">{t('gradeNotYetReleased')}</p>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap justify-center gap-3">
        {canStartRevision && onStartRevision ? (
          <Button
            onClick={onStartRevision}
            disabled={isPending}
          >
            <RotateCcw className="size-4" />
            {t('startRevision')}
          </Button>
        ) : null}

        {canSubmit && onRetry ? (
          <Button
            variant="outline"
            onClick={onRetry}
            disabled={isPending}
          >
            <RotateCcw className="size-4" />
            {t('retryAssessment')}
          </Button>
        ) : null}

        {onNext ? (
          <Button
            variant={canStartRevision || canSubmit ? 'outline' : 'default'}
            onClick={onNext}
          >
            {t('nextActivity')}
            <ChevronRight className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
