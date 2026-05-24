'use client';

import { RotateCcw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { CodeSubmission } from '../domain';

interface SubmissionTimelineProps {
  submissions: CodeSubmission[];
  onRestoreSubmission?: (submission: CodeSubmission) => void;
}

export function SubmissionTimeline({ submissions, onRestoreSubmission }: SubmissionTimelineProps) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 p-4">
        {!submissions.length ? (
          <div className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
            No submissions yet.
          </div>
        ) : (
          submissions.map((submission, index) => (
            <div
              key={submission.submission_uuid ?? submission.uuid ?? index}
              className="bg-card rounded-md border p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">Attempt {submissions.length - index}</span>
                    <Badge variant={submission.score === submission.max_score ? 'success' : 'secondary'}>
                      {submission.score !== undefined
                        ? `${Math.round(submission.score)}/${submission.max_score ?? 100}`
                        : submission.status}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground mt-1 text-xs">
                    {submission.created_at ? new Date(submission.created_at).toLocaleString() : 'Unknown time'}
                    {submission.language_id ? ` - Language ${submission.language_id}` : ''}
                  </div>
                </div>
                {onRestoreSubmission ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onRestoreSubmission(submission)}
                  >
                    <RotateCcw className="size-4" />
                    Restore
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </ScrollArea>
  );
}
