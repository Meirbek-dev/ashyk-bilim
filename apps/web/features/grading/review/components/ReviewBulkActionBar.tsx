'use client';

import { CalendarClock, Download, RotateCcw, Send } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { Submission } from '@/features/grading/domain';
import { exportGradesCSV, batchGradeSubmissions, extendDeadline } from '@/services/grading/grading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export default function ReviewBulkActionBar({
  activityId,
  submissions,
  disabled,
  onRefresh,
}: {
  activityId: number;
  submissions: Submission[];
  disabled: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [deadlineLocal, setDeadlineLocal] = useState('');
  const [reason, setReason] = useState('');

  const gradeable = submissions.filter((submission) => submission.final_score !== null);
  const userUuids = submissions
    .map((submission) => submission.user?.user_uuid)
    .filter((uuid): uuid is string => Boolean(uuid));

  const bulkUpdate = (status: 'PUBLISHED' | 'RETURNED') => {
    if (gradeable.length === 0) {
      toast.error('Selected submissions need saved scores first.');
      return;
    }
    startTransition(async () => {
      try {
        await batchGradeSubmissions(
          gradeable.map((submission) => ({
            submission_uuid: submission.submission_uuid,
            final_score: submission.final_score ?? 0,
            status,
            feedback: submission.grading_json?.feedback ?? null,
            item_feedback: null,
          })),
        );
        toast.success(status === 'PUBLISHED' ? 'Selected grades published' : 'Selected submissions returned');
        await onRefresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Bulk action failed');
      }
    });
  };

  const applyDeadline = () => {
    if (!deadlineLocal || userUuids.length === 0) return;
    startTransition(async () => {
      try {
        await extendDeadline(activityId, {
          user_uuids: userUuids,
          new_due_at: new Date(deadlineLocal).toISOString(),
          reason,
        });
        toast.success('Deadline extension queued');
        setDeadlineLocal('');
        setReason('');
        await onRefresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to extend deadline');
      }
    });
  };

  const exportCsv = () => {
    startTransition(async () => {
      const csv = await exportGradesCSV(activityId);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `grades-activity-${activityId}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">{submissions.length} selected</Badge>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || isPending || gradeable.length === 0}
        onClick={() => bulkUpdate('PUBLISHED')}
      >
        <Send className="size-4" />
        Publish selected
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || isPending || gradeable.length === 0}
        onClick={() => bulkUpdate('RETURNED')}
      >
        <RotateCcw className="size-4" />
        Return selected
      </Button>
      <Input
        type="datetime-local"
        value={deadlineLocal}
        disabled={disabled || isPending}
        className="w-48"
        onChange={(event) => setDeadlineLocal(event.target.value)}
      />
      <Input
        value={reason}
        disabled={disabled || isPending}
        placeholder="Reason"
        className="w-40"
        onChange={(event) => setReason(event.target.value)}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || isPending || !deadlineLocal || userUuids.length === 0}
        onClick={applyDeadline}
      >
        <CalendarClock className="size-4" />
        Extend
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={exportCsv}
      >
        <Download className="size-4" />
        Export
      </Button>
    </div>
  );
}
