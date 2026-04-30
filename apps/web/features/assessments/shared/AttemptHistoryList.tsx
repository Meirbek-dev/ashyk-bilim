'use client';

import { History } from 'lucide-react';

import SubmissionStatusBadge from '@/features/assessments/shared/components/SubmissionStatusBadge';
import type { SubmissionStatus } from '@/features/grading/domain';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface AttemptHistoryItem {
  id: string | number;
  label: string;
  submittedAt?: string | null;
  status?: SubmissionStatus | null;
  scoreLabel?: string | null;
  metaLabel?: string | null;
  onReview?: () => void;
}

interface AttemptHistoryListProps {
  items: AttemptHistoryItem[];
  title?: string;
  emptyLabel?: string;
  compact?: boolean;
  className?: string;
}

export default function AttemptHistoryList({
  items,
  title = 'Attempt history',
  emptyLabel = 'No attempts yet',
  compact = false,
  className,
}: AttemptHistoryListProps) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <History className="text-muted-foreground size-4" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {items.length === 0 ? (
        <div className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">{emptyLabel}</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={cn('rounded-md border p-3', compact && 'p-2')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{item.label}</span>
                    {item.status ? <SubmissionStatusBadge status={item.status} /> : null}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {item.submittedAt ? new Date(item.submittedAt).toLocaleString() : item.metaLabel}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {item.scoreLabel ? <div className="text-sm font-semibold">{item.scoreLabel}</div> : null}
                  {item.onReview ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={item.onReview}
                    >
                      Review
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
