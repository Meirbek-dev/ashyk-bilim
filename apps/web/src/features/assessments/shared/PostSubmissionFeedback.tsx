'use client';

/**
 * PostSubmissionFeedback — Shows grading results respecting review_visibility policy.
 *
 * NONE       → No feedback shown
 * SCORE_ONLY → Only the final score percentage
 * FULL       → Per-item correct/incorrect with explanations
 */

import { CheckCircle2, XCircle, MinusCircle, Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

type ReviewVisibility = 'NONE' | 'SCORE_ONLY' | 'FULL';

interface GradedItemFeedback {
  item_id: string;
  item_text: string;
  score: number;
  max_score: number;
  correct: boolean | null;
  feedback: string;
}

interface PostSubmissionFeedbackProps {
  /** Policy-controlled visibility level. */
  reviewVisibility: ReviewVisibility;
  /** Final score (0–100). */
  finalScore: number | null;
  /** Auto score (0–100). */
  autoScore: number | null;
  /** Per-item grading details (only shown when visibility = FULL). */
  items?: GradedItemFeedback[];
  /** Whether the grade is still pending release (BATCH mode). */
  isPendingRelease?: boolean;
  className?: string;
}

export default function PostSubmissionFeedback({
  reviewVisibility,
  finalScore,
  autoScore,
  items = [],
  isPendingRelease = false,
  className,
}: PostSubmissionFeedbackProps) {
  const t = useTranslations('Features.Assessments.Shared.PostSubmissionFeedback');

  if (isPendingRelease) {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg border p-4', className)}>
        <EyeOff className="text-muted-foreground size-4" />
        <span className="text-muted-foreground text-sm">{t('gradePending')}</span>
      </div>
    );
  }

  if (reviewVisibility === 'NONE') {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg border p-4', className)}>
        <Eye className="text-muted-foreground size-4" />
        <span className="text-muted-foreground text-sm">{t('submissionReceived')}</span>
      </div>
    );
  }

  const displayScore = finalScore ?? autoScore ?? 0;

  if (reviewVisibility === 'SCORE_ONLY') {
    return (
      <div className={cn('rounded-lg border p-4', className)}>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold">{Math.round(displayScore)}%</span>
          <span className="text-muted-foreground text-sm">{t('score')}</span>
        </div>
      </div>
    );
  }

  // FULL visibility
  return (
    <div className={cn('space-y-3 rounded-lg border p-4', className)}>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold">{Math.round(displayScore)}%</span>
        <span className="text-muted-foreground text-sm">{t('score')}</span>
      </div>

      {items.length > 0 && (
        <div className="space-y-2 border-t pt-3">
          {items.map((item) => (
            <div
              key={item.item_id}
              className="flex items-start gap-2 text-sm"
            >
              {item.correct === true && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />}
              {item.correct === false && <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />}
              {item.correct === null && <MinusCircle className="text-muted-foreground mt-0.5 size-4 shrink-0" />}
              <div className="flex-1">
                <p className="font-medium">{item.item_text || t('questionNumber', { id: item.item_id })}</p>
                {item.feedback && <p className="text-muted-foreground">{item.feedback}</p>}
                <p className="text-muted-foreground text-xs">
                  {t('points', { score: item.score, max_score: item.max_score })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
