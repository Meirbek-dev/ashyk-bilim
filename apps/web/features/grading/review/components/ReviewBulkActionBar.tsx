'use client';

import { CalendarClock, Clock3, Download, RotateCcw, Send } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { Submission } from '@/features/grading/domain';
import { getReleaseState } from '@/features/grading/domain';
import {
  exportGradesCSV,
  batchGradeSubmissions,
  extendDeadline,
  publishActivityGrades,
} from '@/services/grading/grading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type PendingAction = 'publish-selected' | 'return-selected' | 'extend-deadline' | 'release-hidden' | null;

interface BulkActionSummary {
  label: string;
  detail: string;
  tone: 'default' | 'success' | 'warning';
}

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
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [lastSummary, setLastSummary] = useState<BulkActionSummary | null>(null);

  const gradeable = submissions.filter((submission) => submission.final_score !== null);
  const userUuids = submissions
    .map((submission) => submission.user?.user_uuid)
    .filter((uuid): uuid is string => Boolean(uuid));
  const releaseSummary = useMemo(() => {
    let visible = 0;
    let hidden = 0;
    for (const submission of submissions) {
      const releaseState = getReleaseState(submission.status);
      if (releaseState === 'VISIBLE' || releaseState === 'RETURNED_FOR_REVISION') {
        visible += 1;
      } else {
        hidden += 1;
      }
    }
    return { visible, hidden };
  }, [submissions]);

  const bulkUpdate = (status: 'PUBLISHED' | 'RETURNED') => {
    if (gradeable.length === 0) {
      toast.error('Selected submissions need saved scores first.');
      return;
    }
    startTransition(async () => {
      try {
        const result = await batchGradeSubmissions(
          gradeable.map((submission) => ({
            submission_uuid: submission.submission_uuid,
            final_score: submission.final_score ?? 0,
            status,
            feedback: submission.grading_json?.feedback ?? null,
            item_feedback: null,
          })),
        );
        toast.success(status === 'PUBLISHED' ? 'Selected grades published' : 'Selected submissions returned');
        setLastSummary({
          label: status === 'PUBLISHED' ? 'Bulk publish finished' : 'Bulk return finished',
          detail: `${result.succeeded} succeeded${result.failed > 0 ? `, ${result.failed} failed` : ''}.`,
          tone: result.failed > 0 ? 'warning' : 'success',
        });
        setPendingAction(null);
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
        setLastSummary({
          label: 'Deadline extension queued',
          detail: `${userUuids.length} learner${userUuids.length === 1 ? '' : 's'} targeted.${reason ? ` Reason: ${reason}` : ''}`,
          tone: 'success',
        });
        setDeadlineLocal('');
        setReason('');
        setPendingAction(null);
        await onRefresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to extend deadline');
      }
    });
  };

  const releaseHiddenGrades = () => {
    startTransition(async () => {
      try {
        const result = await publishActivityGrades(activityId);
        toast.success('Hidden grades released');
        setLastSummary({
          label: 'Grade release finished',
          detail: `${result.published_count} newly visible${result.already_published_count > 0 ? `, ${result.already_published_count} already visible` : ''}.`,
          tone: 'success',
        });
        setPendingAction(null);
        await onRefresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to release hidden grades');
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
      <Badge variant="outline">{releaseSummary.hidden} hidden</Badge>
      <Badge variant="outline">{releaseSummary.visible} visible</Badge>
      {isPending ? (
        <Badge variant="warning">
          <Clock3 className="size-3" />
          Running bulk action
        </Badge>
      ) : null}
      {lastSummary ? (
        <Badge variant={lastSummary.tone === 'warning' ? 'warning' : lastSummary.tone === 'success' ? 'success' : 'outline'}>
          {lastSummary.label}
        </Badge>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || isPending || gradeable.length === 0}
        onClick={() => setPendingAction('publish-selected')}
      >
        <Send className="size-4" />
        Publish selected
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || isPending || gradeable.length === 0}
        onClick={() => setPendingAction('return-selected')}
      >
        <RotateCcw className="size-4" />
        Return selected
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => setPendingAction('release-hidden')}
      >
        <Send className="size-4" />
        Release hidden grades
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
        onClick={() => setPendingAction('extend-deadline')}
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

      <Dialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{getDialogTitle(pendingAction)}</DialogTitle>
            <DialogDescription>{getDialogDescription(pendingAction)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {pendingAction === 'publish-selected' || pendingAction === 'return-selected' ? (
              <>
                <PreviewRow label="Selected submissions" value={String(submissions.length)} />
                <PreviewRow label="Grade-ready" value={String(gradeable.length)} />
                <PreviewRow label="Hidden from student" value={String(releaseSummary.hidden)} />
                <PreviewRow label="Already visible" value={String(releaseSummary.visible)} />
              </>
            ) : null}
            {pendingAction === 'extend-deadline' ? (
              <>
                <PreviewRow label="Learners" value={String(userUuids.length)} />
                <PreviewRow label="New due date" value={deadlineLocal || 'Not set'} />
                <PreviewRow label="Reason" value={reason || 'No reason provided'} />
              </>
            ) : null}
            {pendingAction === 'release-hidden' ? (
              <>
                <PreviewRow label="Selected hidden submissions" value={String(releaseSummary.hidden)} />
                <PreviewRow label="Already visible" value={String(releaseSummary.visible)} />
                <p className="text-muted-foreground text-xs">
                  This applies the activity-level grade release action and updates any graded submissions that are still hidden.
                </p>
              </>
            ) : null}
            {lastSummary ? <p className="text-muted-foreground text-xs">Last result: {lastSummary.detail}</p> : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingAction(null)}
            >
              Cancel
            </Button>
            {pendingAction === 'publish-selected' ? <Button onClick={() => bulkUpdate('PUBLISHED')}>Confirm publish</Button> : null}
            {pendingAction === 'return-selected' ? <Button onClick={() => bulkUpdate('RETURNED')}>Confirm return</Button> : null}
            {pendingAction === 'extend-deadline' ? <Button onClick={applyDeadline}>Queue extension</Button> : null}
            {pendingAction === 'release-hidden' ? <Button onClick={releaseHiddenGrades}>Release grades</Button> : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function getDialogTitle(action: PendingAction): string {
  switch (action) {
    case 'publish-selected':
      return 'Publish selected grades';
    case 'return-selected':
      return 'Return selected submissions';
    case 'extend-deadline':
      return 'Extend deadlines';
    case 'release-hidden':
      return 'Release hidden grades';
    default:
      return 'Bulk action';
  }
}

function getDialogDescription(action: PendingAction): string {
  switch (action) {
    case 'publish-selected':
      return 'Review the exact impact before making grades visible to students.';
    case 'return-selected':
      return 'This will move selected submissions into the returned-for-revision state.';
    case 'extend-deadline':
      return 'Queue a deadline extension for the selected learners.';
    case 'release-hidden':
      return 'Make currently hidden graded submissions visible to students for this activity.';
    default:
      return 'Confirm the selected bulk action.';
  }
}
