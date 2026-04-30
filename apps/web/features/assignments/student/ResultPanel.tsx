'use client';

import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import type { Submission } from '@/features/grading/domain';
import { Alert, AlertDescription, AlertTitle } from '@components/ui/alert';
import { Card, CardContent } from '@components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getAPIUrl } from '@services/config/config';

interface ResultPanelProps {
  submission: Submission;
  onRefresh?: () => void | Promise<void>;
}

interface GradedItem {
  item_id: string;
  item_text?: string | null;
  user_answer?: unknown;
  correct_answer?: unknown;
  correct?: boolean | null;
  score?: number | null;
  max_score?: number | null;
  feedback?: string | null;
  needs_manual_review?: boolean | null;
}

export default function StudentResultPanel({ submission, onRefresh }: ResultPanelProps) {
  const lastEventRef = useRef<string | null>(null);

  useEffect(() => {
    if (!submission.submission_uuid || typeof EventSource === 'undefined') return;

    const source = new EventSource(`${getAPIUrl()}grading/submissions/${submission.submission_uuid}/feedback-stream`, {
      withCredentials: true,
    });

    const handleRefreshEvent = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as { event?: string; sent_at?: string };
        const dedupeKey = `${data.event ?? event.type}:${data.sent_at ?? event.lastEventId}`;
        if (lastEventRef.current === dedupeKey) return;
        lastEventRef.current = dedupeKey;
        if (event.type === 'grade.published') toast.success('Grade released');
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
  }, [onRefresh, submission.submission_uuid]);

  const breakdown = submission.grading_json;
  const score = submission.final_score;
  const passed = score !== null && score !== undefined && score >= 50;
  const scoreColor = score === null ? 'text-muted-foreground' : passed ? 'text-success' : 'text-destructive';
  const isPublished = submission.status === 'PUBLISHED' || submission.status === 'RETURNED';
  const items = Array.isArray(breakdown?.items) ? (breakdown.items as GradedItem[]) : [];

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Result</h2>
        <p className="text-muted-foreground text-sm">Released score and feedback.</p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="text-muted-foreground text-sm">Score</p>
            <p className={cn('text-3xl font-bold', scoreColor)}>{score !== null ? `${score}/100` : '--'}</p>
          </div>
          {score !== null ? (
            <Badge variant={passed ? 'success' : 'destructive'} className="self-start">
              {passed ? 'Passed' : 'Needs work'}
            </Badge>
          ) : null}
        </CardContent>
      </Card>

      {submission.auto_score !== null && submission.auto_score !== submission.final_score ? (
        <p className="text-muted-foreground text-xs">Auto score: {submission.auto_score}/100</p>
      ) : null}

      {isPublished && breakdown?.feedback ? (
        <Alert variant="default" className="border-primary/70 bg-primary/10 border-l-4">
          <AlertTitle className="text-sm font-semibold">Teacher feedback</AlertTitle>
          <AlertDescription className="text-sm italic">{breakdown.feedback}</AlertDescription>
        </Alert>
      ) : null}

      {isPublished && items.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-foreground text-sm font-semibold">Breakdown</h3>
          {items.map((item, index) => (
            <ResultItem key={item.item_id} item={item} index={index} />
          ))}
        </div>
      ) : null}

      {items.length === 0 && score === null ? (
        <p className="text-muted-foreground text-sm italic">Waiting for grade.</p>
      ) : null}
    </section>
  );
}

function ResultItem({ item, index }: { item: GradedItem; index: number }) {
  const icon = item.needs_manual_review ? (
    <AlertCircle className="text-warning size-4 shrink-0" />
  ) : item.correct ? (
    <CheckCircle2 className="text-success size-4 shrink-0" />
  ) : (
    <XCircle className="text-destructive size-4 shrink-0" />
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
              <Badge variant="outline" className="text-xs font-semibold">
                {item.score ?? 0} / {item.max_score ?? 0}
              </Badge>
            </div>
            {item.user_answer !== null && item.user_answer !== undefined ? (
              <div className="bg-muted/70 text-muted-foreground rounded-md px-3 py-2 text-sm">
                <span className="mr-2 text-xs font-medium">Your answer:</span>
                {typeof item.user_answer === 'string' ? item.user_answer : JSON.stringify(item.user_answer)}
              </div>
            ) : null}
            {item.correct === false && item.correct_answer !== null && item.correct_answer !== undefined ? (
              <div className="bg-success/20 text-success rounded-md px-3 py-2 text-sm">
                <span className="mr-2 text-xs font-medium">Correct answer:</span>
                {typeof item.correct_answer === 'string' ? item.correct_answer : JSON.stringify(item.correct_answer)}
              </div>
            ) : null}
            {item.feedback ? <p className="text-muted-foreground text-xs italic">{item.feedback}</p> : null}
            {item.needs_manual_review ? <p className="text-warning text-xs font-medium">Pending review</p> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
