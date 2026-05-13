'use client';

/**
 * AttemptHistoryPanel — Collapsible panel showing a student's prior attempts.
 *
 * Displays attempt number, score, status, and timestamp for each submission.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, History } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AttemptRecord {
  submission_uuid: string;
  attempt_number: number;
  status: string;
  final_score: number | null;
  auto_score: number | null;
  submitted_at: string | null;
  is_late: boolean;
}

interface AttemptHistoryPanelProps {
  attempts: AttemptRecord[];
  currentSubmissionUuid?: string | null;
  className?: string;
}

export default function AttemptHistoryPanel({ attempts, currentSubmissionUuid, className }: AttemptHistoryPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (attempts.length <= 1) return null;

  return (
    <div className={cn('border rounded-md', className)}>
      <button
        type="button"
        className="hover:bg-muted/50 flex w-full items-center gap-2 p-2 text-sm font-medium"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <History className="size-3.5" />
        <span>Attempt History ({attempts.length})</span>
      </button>

      {isOpen && (
        <div className="divide-y border-t">
          {attempts.map((attempt) => (
            <div
              key={attempt.submission_uuid}
              className={cn(
                'flex items-center justify-between px-3 py-1.5 text-xs',
                attempt.submission_uuid === currentSubmissionUuid && 'bg-primary/5',
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono">#{attempt.attempt_number}</span>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-medium',
                    attempt.status === 'PUBLISHED' && 'bg-green-100 text-green-700',
                    attempt.status === 'GRADED' && 'bg-blue-100 text-blue-700',
                    attempt.status === 'PENDING' && 'bg-yellow-100 text-yellow-700',
                    attempt.status === 'RETURNED' && 'bg-orange-100 text-orange-700',
                  )}
                >
                  {attempt.status}
                </span>
                {attempt.is_late && <span className="text-[10px] text-red-600">LATE</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono">{attempt.final_score ?? attempt.auto_score ?? '—'}%</span>
                {attempt.submitted_at && (
                  <span className="text-muted-foreground">{new Date(attempt.submitted_at).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
