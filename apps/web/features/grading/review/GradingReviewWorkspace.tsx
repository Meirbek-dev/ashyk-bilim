'use client';

import {
  BookOpenCheck,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  LoaderCircle,
  RotateCcw,
  Search,
  Send,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  canTeacherEditGrade,
  getSubmissionDisplayName,
  needsTeacherAction,
  type Submission,
  type SubmissionStatus,
  type TeacherGradeInput,
} from '@/features/grading/domain';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { exportGradesCSV, batchGradeSubmissions, extendDeadline, saveGrade } from '@/services/grading/grading';
import { useSubmissionStats } from '@/hooks/useSubmissionStats';
import { useGradingPanel } from '@/hooks/useGradingPanel';
import { useSubmissions } from '@/hooks/useSubmissions';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import SubmissionStatusBadge from '@/features/assessments/shared/components/SubmissionStatusBadge';
import GradingStats from '@/components/Grading/GradingStats';
import type { KindModule, KindReviewDetailProps } from '@/features/assessments/registry';

interface GradingReviewWorkspaceProps {
  activityId: number;
  /** Activity UUID — forwarded to kind-specific ReviewDetail components (e.g. exam question loading). */
  activityUuid?: string;
  title?: string;
  initialSubmissionUuid?: string | null;
  /** Kind module loaded by the caller; provides ReviewDetail for kind-aware center-pane rendering. */
  kindModule?: KindModule;
}

type StatusFilter = SubmissionStatus | 'ALL' | 'NEEDS_GRADING';

interface GradeDraft {
  score: string;
  feedback: string;
}

export default function GradingReviewWorkspace({ activityId, activityUuid, title, initialSubmissionUuid, kindModule }: GradingReviewWorkspaceProps) {
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('NEEDS_GRADING');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('submitted_at');
  const [selectedUuid, setSelectedUuid] = useState<string | null>(initialSubmissionUuid ?? null);
  const [selectedUuids, setSelectedUuids] = useState<Set<string>>(new Set());

  const { submissions, total, pages, page, setPage, isLoading, mutate } = useSubmissions({
    activityId,
    status: activeFilter === 'ALL' ? undefined : activeFilter,
    search: search || undefined,
    sortBy,
    pageSize: 20,
  });
  const { stats, mutate: mutateStats } = useSubmissionStats(activityId);

  useEffect(() => {
    if (initialSubmissionUuid) setSelectedUuid(initialSubmissionUuid);
  }, [initialSubmissionUuid]);

  useEffect(() => {
    if (!selectedUuid && submissions[0]) setSelectedUuid(submissions[0].submission_uuid);
    if (
      selectedUuid &&
      selectedUuid !== initialSubmissionUuid &&
      submissions.length > 0 &&
      !submissions.some((submission) => submission.submission_uuid === selectedUuid)
    ) {
      setSelectedUuid(submissions[0]?.submission_uuid ?? null);
    }
  }, [initialSubmissionUuid, selectedUuid, submissions]);

  const selectedSubmission = submissions.find((submission) => submission.submission_uuid === selectedUuid) ?? null;
  const selectedSubmissions = submissions.filter((submission) => selectedUuids.has(submission.submission_uuid));
  const selectedIndex = selectedUuid ? submissions.findIndex((submission) => submission.submission_uuid === selectedUuid) : -1;

  const refresh = useCallback(async () => {
    await Promise.all([mutate(), mutateStats()]);
  }, [mutate, mutateStats]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault();
        const next = submissions[Math.min(submissions.length - 1, Math.max(0, selectedIndex + 1))];
        if (next) setSelectedUuid(next.submission_uuid);
      }
      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault();
        const previous = submissions[Math.max(0, selectedIndex - 1)];
        if (previous) setSelectedUuid(previous.submission_uuid);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, submissions]);

  return (
    <div className="flex min-h-[calc(100vh-96px)] flex-col">
      <div className="border-b px-4 py-4 lg:px-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{title ?? 'Submission Review'}</h1>
              <p className="text-muted-foreground text-sm">
                {stats?.needs_grading_count ?? 0} need grading · {total} in current queue
              </p>
            </div>
            <ReviewBulkActionBar
              activityId={activityId}
              submissions={selectedSubmissions}
              disabled={selectedSubmissions.length === 0}
              onRefresh={async () => {
                setSelectedUuids(new Set());
                await refresh();
              }}
            />
          </div>
          <GradingStats activityId={activityId} />
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)_24rem]">
        <ReviewQueuePane
          submissions={submissions}
          total={total}
          pages={pages}
          page={page}
          activeFilter={activeFilter}
          search={search}
          sortBy={sortBy}
          isLoading={isLoading}
          selectedUuid={selectedUuid}
          selectedUuids={selectedUuids}
          onFilterChange={(value) => {
            setActiveFilter(value);
            setPage(1);
          }}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          onSortChange={(value) => {
            setSortBy(value);
            setPage(1);
          }}
          onPageChange={setPage}
          onSelectSubmission={setSelectedUuid}
          onToggleSelected={(uuid, checked) =>
            setSelectedUuids((current) => {
              const next = new Set(current);
              if (checked) next.add(uuid);
              else next.delete(uuid);
              return next;
            })
          }
        />

        <ReviewCenterPane
          selectedUuid={selectedUuid}
          fallbackSubmission={selectedSubmission}
          activityUuid={activityUuid}
          ReviewDetail={kindModule?.ReviewDetail}
        />

        <ReviewGradePane
          submissionUuid={selectedUuid}
          onSaved={refresh}
          onNavigate={(direction) => {
            const nextIndex = direction === 'next' ? selectedIndex + 1 : selectedIndex - 1;
            const next = submissions[nextIndex];
            if (next) setSelectedUuid(next.submission_uuid);
          }}
          hasPrevious={selectedIndex > 0}
          hasNext={selectedIndex >= 0 && selectedIndex < submissions.length - 1}
        />
      </div>
    </div>
  );
}

function ReviewQueuePane({
  submissions,
  total,
  pages,
  page,
  activeFilter,
  search,
  sortBy,
  isLoading,
  selectedUuid,
  selectedUuids,
  onFilterChange,
  onSearchChange,
  onSortChange,
  onPageChange,
  onSelectSubmission,
  onToggleSelected,
}: {
  submissions: Submission[];
  total: number;
  pages: number;
  page: number;
  activeFilter: StatusFilter;
  search: string;
  sortBy: string;
  isLoading: boolean;
  selectedUuid: string | null;
  selectedUuids: Set<string>;
  onFilterChange: (value: StatusFilter) => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onPageChange: (value: number | ((current: number) => number)) => void;
  onSelectSubmission: (uuid: string) => void;
  onToggleSelected: (uuid: string, checked: boolean) => void;
}) {
  return (
    <aside className="border-b bg-muted/20 p-4 lg:border-r lg:border-b-0">
      <div className="space-y-3">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search learner"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NativeSelect
            value={activeFilter}
            onChange={(event) => onFilterChange(event.target.value as StatusFilter)}
            aria-label="Status filter"
          >
            <NativeSelectOption value="ALL">All</NativeSelectOption>
            <NativeSelectOption value="NEEDS_GRADING">Needs grading</NativeSelectOption>
            <NativeSelectOption value="PENDING">Pending</NativeSelectOption>
            <NativeSelectOption value="GRADED">Graded</NativeSelectOption>
            <NativeSelectOption value="PUBLISHED">Published</NativeSelectOption>
            <NativeSelectOption value="RETURNED">Returned</NativeSelectOption>
          </NativeSelect>
          <NativeSelect
            value={sortBy}
            onChange={(event) => onSortChange(event.target.value)}
            aria-label="Sort"
          >
            <NativeSelectOption value="submitted_at">Submitted</NativeSelectOption>
            <NativeSelectOption value="final_score">Score</NativeSelectOption>
            <NativeSelectOption value="attempt_number">Attempt</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>{total} submissions</span>
        <span>{selectedUuids.size} selected</span>
      </div>

      <div className="mt-3 space-y-2">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            Loading
          </div>
        ) : submissions.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No submissions found.</div>
        ) : (
          submissions.map((submission) => {
            const selected = submission.submission_uuid === selectedUuid;
            const displayName = getSubmissionDisplayName(submission);
            return (
              <div
                key={submission.submission_uuid}
                className={cn(
                  'rounded-md border bg-background p-3 transition hover:bg-muted/60',
                  selected && 'border-primary ring-primary/20 ring-2',
                )}
              >
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={selectedUuids.has(submission.submission_uuid)}
                    onCheckedChange={(checked) => onToggleSelected(submission.submission_uuid, checked === true)}
                    aria-label={`Select ${displayName}`}
                  />
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onSelectSubmission(submission.submission_uuid)}
                  >
                    <div className="truncate text-sm font-medium">{displayName}</div>
                    <div className="text-muted-foreground truncate text-xs">{submission.user?.email ?? `User #${submission.user_id}`}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <SubmissionStatusBadge status={submission.status} />
                      {submission.is_late ? <Badge variant="destructive">Late</Badge> : null}
                      {needsTeacherAction(submission.status) ? <Badge variant="warning">Action</Badge> : null}
                    </div>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange((current) => current - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => onPageChange((current) => current + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : null}
    </aside>
  );
}

function ReviewCenterPane({
  selectedUuid,
  fallbackSubmission,
}: {
  selectedUuid: string | null;
  fallbackSubmission: Submission | null;
}) {
  const { submission, isLoading } = useGradingPanel(selectedUuid);
  const current = submission ?? fallbackSubmission;

  if (!selectedUuid) {
    return <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">Select a submission.</div>;
  }

  if (isLoading && !current) {
    return <div className="flex items-center justify-center p-8 text-sm text-muted-foreground"><LoaderCircle className="mr-2 size-4 animate-spin" />Loading submission</div>;
  }

  if (!current) {
    return <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">Submission unavailable.</div>;
  }

  return (
    <main className="min-w-0 border-b p-4 lg:border-b-0 xl:border-r">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">{getSubmissionDisplayName(current)}</h2>
              <p className="text-muted-foreground text-sm">
                Attempt #{current.attempt_number} · {formatDate(current.submitted_at)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SubmissionStatusBadge status={current.status} />
              {current.is_late ? <Badge variant="destructive">Late</Badge> : null}
            </div>
          </div>
        </div>

        <AttemptHistory submission={current} />
        <SubmittedAnswers submission={current} />
      </div>
    </main>
  );
}

function ReviewGradePane({
  submissionUuid,
  onSaved,
  onNavigate,
  hasPrevious,
  hasNext,
}: {
  submissionUuid: string | null;
  onSaved: () => Promise<void>;
  onNavigate: (direction: 'previous' | 'next') => void;
  hasPrevious: boolean;
  hasNext: boolean;
}) {
  const { submission, isLoading, mutate } = useGradingPanel(submissionUuid);
  const [draft, setDraft] = useState<GradeDraft>({ score: '', feedback: '' });
  const [isSaving, startSaving] = useTransition();

  useEffect(() => {
    setDraft({
      score: submission?.final_score !== null && submission?.final_score !== undefined ? String(submission.final_score) : '',
      feedback: submission?.grading_json?.feedback ?? '',
    });
  }, [submission?.final_score, submission?.grading_json?.feedback, submission?.submission_uuid]);

  const save = (status: TeacherGradeInput['status']) => {
    if (!submission) return;
    const score = Number.parseFloat(draft.score);
    if (Number.isNaN(score) || score < 0 || score > 100) {
      toast.error('Enter a score from 0 to 100.');
      return;
    }

    startSaving(async () => {
      try {
        await saveGrade(submission.submission_uuid, {
          final_score: score,
          feedback: draft.feedback,
          status,
          item_feedback: [],
        });
        toast.success(status === 'PUBLISHED' ? 'Grade published' : status === 'RETURNED' ? 'Returned' : 'Grade saved');
        await Promise.all([mutate(), onSaved()]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to save grade');
      }
    });
  };

  if (!submissionUuid) {
    return <aside className="p-4 text-sm text-muted-foreground">Select a submission to grade.</aside>;
  }

  if (isLoading && !submission) {
    return <aside className="flex items-center justify-center p-4 text-sm text-muted-foreground"><LoaderCircle className="mr-2 size-4 animate-spin" />Loading</aside>;
  }

  if (!submission) {
    return <aside className="p-4 text-sm text-muted-foreground">Grade form unavailable.</aside>;
  }

  const editable = canTeacherEditGrade(submission.status);

  return (
    <aside className="space-y-5 p-4 xl:sticky xl:top-0 xl:h-[calc(100vh-96px)] xl:overflow-y-auto">
      <div>
        <h2 className="text-lg font-semibold">Grade</h2>
        <p className="text-muted-foreground text-sm">Final score, feedback, and release actions.</p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasPrevious}
          onClick={() => onNavigate('previous')}
        >
          <ChevronLeft className="size-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNext}
          onClick={() => onNavigate('next')}
        >
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="review-score">Final score</Label>
        <div className="flex items-center gap-2">
          <Input
            id="review-score"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={draft.score}
            disabled={!editable || isSaving}
            onChange={(event) => setDraft((current) => ({ ...current, score: event.target.value }))}
          />
          <span className="text-muted-foreground text-sm">/100</span>
        </div>
        {submission.auto_score !== null && submission.auto_score !== undefined ? (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-xs"
            onClick={() => setDraft((current) => ({ ...current, score: String(submission.auto_score) }))}
          >
            Use auto score {submission.auto_score}
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="review-feedback">Final feedback</Label>
        <Textarea
          id="review-feedback"
          value={draft.feedback}
          disabled={!editable || isSaving}
          className="min-h-36"
          onChange={(event) => setDraft((current) => ({ ...current, feedback: event.target.value }))}
        />
      </div>

      <div className="grid gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!editable || isSaving}
          onClick={() => save('GRADED')}
        >
          {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <BookOpenCheck className="size-4" />}
          Save grade
        </Button>
        <Button
          type="button"
          disabled={!editable || isSaving}
          onClick={() => save('PUBLISHED')}
        >
          <Send className="size-4" />
          Publish grade
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!editable || isSaving}
          onClick={() => save('RETURNED')}
        >
          <RotateCcw className="size-4" />
          Return for revision
        </Button>
      </div>
    </aside>
  );
}

function ReviewBulkActionBar({
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

function AttemptHistory({ submission }: { submission: Submission }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">Attempt history</h3>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <HistoryItem label="Started" value={formatDate(submission.started_at)} />
        <HistoryItem label="Submitted" value={formatDate(submission.submitted_at)} />
        <HistoryItem label="Graded" value={formatDate(submission.graded_at)} />
        <HistoryItem label="Version" value={`v${submission.version}`} />
      </div>
    </section>
  );
}

function SubmittedAnswers({ submission }: { submission: Submission }) {
  const tasks = submission.answers_json?.tasks;
  const items = Array.isArray(tasks) ? tasks : [];
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Submitted work</h3>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No answer payload was recorded.</div>
      ) : (
        items.map((item, index) => (
          <div
            key={typeof item === 'object' && item !== null && 'task_uuid' in item ? String(item.task_uuid) : index}
            className="rounded-lg border bg-card p-4"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <Badge variant="secondary">Task {index + 1}</Badge>
              {typeof item === 'object' && item !== null && 'content_type' in item ? (
                <Badge variant="outline">{String(item.content_type)}</Badge>
              ) : null}
            </div>
            <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(item, null, 2)}
            </pre>
          </div>
        ))
      )}
    </section>
  );
}

function HistoryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
