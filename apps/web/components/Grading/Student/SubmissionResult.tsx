'use client';

/**
 * SubmissionResult
 *
 * Shows a student their grading breakdown: score, teacher feedback,
 * per-item results (question text, their answer, correct answer, item feedback).
 *
 * Rendered inside SubmissionShell when status is GRADED or RETURNED.
 */

import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@components/ui/alert';
import type { Submission, GradedItem } from '@/types/grading';
import { Card, CardContent } from '@components/ui/card';
import { Badge } from '@components/ui/badge';
import { cn } from '@/lib/utils';
import { getAPIUrl } from '@services/config/config';

interface SubmissionResultProps {
  submission: Submission;
  onRefresh?: () => void | Promise<void>;
}

export default function SubmissionResult({ submission, onRefresh }: SubmissionResultProps) {
  const t = useTranslations('Grading.Result');
  const breakdown = submission.grading_json;
  const score = submission.final_score;
  const lastEventRef = useRef<string | null>(null);

  useEffect(() => {
    if (!submission.submission_uuid || typeof EventSource === 'undefined') return;

    const source = new EventSource(
      `${getAPIUrl()}grading/submissions/${submission.submission_uuid}/feedback-stream`,
      { withCredentials: true },
    );

    const handleRefreshEvent = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as { event?: string; sent_at?: string };
        const dedupeKey = `${data.event ?? event.type}:${data.sent_at ?? event.lastEventId}`;
        if (lastEventRef.current === dedupeKey) return;
        lastEventRef.current = dedupeKey;

        if (event.type === 'grade.published') {
          toast.success(t('gradePublishedToast'));
        }
        void onRefresh?.();
      } catch {
        void onRefresh?.();
      }
    };

    source.addEventListener('grade.published', handleRefreshEvent);
    source.addEventListener('submission.returned', handleRefreshEvent);
    source.addEventListener('feedback.created', handleRefreshEvent);
    source.addEventListener('feedback.updated', handleRefreshEvent);
    source.addEventListener('feedback.deleted', handleRefreshEvent);

    return () => source.close();
  }, [onRefresh, submission.submission_uuid, t]);

  const passed = score != null && score >= 50;
  const scoreColor = score === null ? 'text-muted-foreground' : passed ? 'text-success' : 'text-destructive';
  // Only show teacher feedback and item breakdown if grade is published
  const isPublished = submission.status === 'PUBLISHED' || submission.status === 'RETURNED';

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="text-muted-foreground text-sm">{t('score')}</p>
            <p className={cn('text-3xl font-bold', scoreColor)}>{score !== null ? `${score}/100` : '—'}</p>
          </div>
          {score !== null && (
            <Badge
              variant={passed ? 'success' : 'destructive'}
              className="self-start"
            >
              {passed ? t('passed') : t('failed')}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Auto-score note */}
      {submission.auto_score !== null && submission.auto_score !== submission.final_score && (
        <p className="text-muted-foreground text-xs">
          {t('autoScore')}: {submission.auto_score}/100
        </p>
      )}

      {/* Teacher feedback — only visible after publishing */}
      {isPublished && breakdown?.feedback && (
        <Alert
          variant="default"
          className="border-primary/70 bg-primary/10 border-l-4"
        >
          <AlertTitle className="text-sm font-semibold">{t('teacherFeedback')}</AlertTitle>
          <AlertDescription className="text-sm italic">{breakdown.feedback}</AlertDescription>
        </Alert>
      )}

      {/* Per-item breakdown — only visible after publishing */}
      {isPublished && breakdown?.items && breakdown.items.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-foreground text-sm font-semibold">{t('breakdown')}</h3>
          {breakdown.items.map((item, i) => (
            <ResultItem
              key={item.item_id}
              item={item}
              index={i}
            />
          ))}
        </div>
      )}

      {/* Waiting state */}
      {(!breakdown?.items || breakdown.items.length === 0) && score === null && (
        <p className="text-muted-foreground text-sm italic">{t('waitingForGrade')}</p>
      )}
    </div>
  );
}

function ResultItem({ item, index }: { item: GradedItem; index: number }) {
  const t = useTranslations('Grading.Result');

  const icon = item.needs_manual_review ? (
    <AlertCircle className="text-warning h-4 w-4 shrink-0" />
  ) : item.correct ? (
    <CheckCircle2 className="text-success h-4 w-4 shrink-0" />
  ) : (
    <XCircle className="text-destructive h-4 w-4 shrink-0" />
  );

  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex items-start gap-2">
          {icon}
          <div className="flex-1 space-y-1.5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-foreground text-sm font-medium">
                {index + 1}. {item.item_text || item.item_id}
              </p>
              <Badge
                variant="outline"
                className="text-xs font-semibold"
              >
                {item.score} / {item.max_score}
              </Badge>
            </div>

            {item.user_answer !== null && (
              <div className="bg-muted/70 text-muted-foreground rounded-md px-3 py-2 text-sm">
                <span className="text-muted-foreground mr-2 text-xs font-medium">{t('yourAnswer')}:</span>
                {typeof item.user_answer === 'string' ? item.user_answer : JSON.stringify(item.user_answer)}
              </div>
            )}

            {item.correct === false && item.correct_answer !== null && (
              <div className="bg-success/20 text-success rounded-md px-3 py-2 text-sm">
                <span className="text-success mr-2 text-xs font-medium">{t('correctAnswer')}:</span>
                {typeof item.correct_answer === 'string' ? item.correct_answer : JSON.stringify(item.correct_answer)}
              </div>
            )}

            {item.feedback && <p className="text-muted-foreground text-xs italic">{item.feedback}</p>}
            {item.needs_manual_review && <p className="text-warning text-xs font-medium">{t('pendingReview')}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
