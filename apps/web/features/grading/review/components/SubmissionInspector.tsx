'use client';

import type { ComponentType } from 'react';
import { LoaderCircle, ShieldAlert } from 'lucide-react';

import { getSubmissionDisplayName, getSubmissionViolations } from '@/features/grading/domain';
import type { Submission } from '@/features/grading/domain';
import SubmissionStatusBadge from '@/features/assessments/shared/components/SubmissionStatusBadge';
import type { KindReviewDetailProps } from '@/features/assessments/registry';
import { useGradingPanel } from '@/hooks/useGradingPanel';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function SubmissionInspector({
  selectedUuid,
  fallbackSubmission,
  activityUuid,
  ReviewDetail,
}: {
  selectedUuid: string | null;
  fallbackSubmission: Submission | null;
  activityUuid?: string;
  ReviewDetail?: ComponentType<KindReviewDetailProps>;
}) {
  const { submission, isLoading } = useGradingPanel(selectedUuid);
  const current = submission ?? fallbackSubmission;

  if (!selectedUuid) {
    return (
      <div className="text-muted-foreground flex items-center justify-center p-8 text-sm">Select a submission.</div>
    );
  }

  if (isLoading && !current) {
    return (
      <div className="text-muted-foreground flex items-center justify-center p-8 text-sm">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        Loading submission
      </div>
    );
  }

  if (!current) {
    return (
      <div className="text-muted-foreground flex items-center justify-center p-8 text-sm">Submission unavailable.</div>
    );
  }

  return (
    <main className="min-w-0 border-b p-4 lg:border-b-0 xl:border-r">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="bg-card rounded-lg border p-4">
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

        <Tabs defaultValue="work">
          <TabsList>
            <TabsTrigger value="work">Submitted work</TabsTrigger>
            <TabsTrigger value="violations">
              Violations
              {getViolationCount(current) > 0 ? (
                <Badge
                  variant="destructive"
                  className="ml-1.5 h-4 min-w-4 rounded-full px-1 text-[10px]"
                >
                  {getViolationCount(current)}
                </Badge>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="work"
            className="mt-4"
          >
            {ReviewDetail ? (
              <ReviewDetail
                submission={current}
                activityUuid={activityUuid}
              />
            ) : (
              <SubmittedAnswers submission={current} />
            )}
          </TabsContent>

          <TabsContent
            value="violations"
            className="mt-4"
          >
            <ViolationLog submission={current} />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function getViolationCount(submission: Submission): number {
  return getSubmissionViolations(submission).length;
}

function ViolationLog({ submission }: { submission: Submission }) {
  const violations = getSubmissionViolations(submission);

  if (violations.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
        No violations recorded.
      </div>
    );
  }

  return (
    <section className="bg-card rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShieldAlert className="size-4 text-amber-500" />
        <h3 className="text-sm font-semibold">
          {violations.length} violation{violations.length !== 1 ? 's' : ''}
        </h3>
      </div>
      <ul className="space-y-2 text-xs">
        {violations.map((v, idx) => {
          const kind = String(v.kind ?? 'UNKNOWN');
          const occurredAt = String(v.occurred_at ?? '');
          const count = typeof v.count === 'number' ? v.count : null;
          return (
            <li
              key={idx}
              className="flex items-center justify-between gap-4 rounded-md border px-3 py-2"
            >
              <Badge
                variant="outline"
                className="font-mono text-[10px]"
              >
                {kind}
              </Badge>
              <span className="text-muted-foreground grow text-right">
                {occurredAt ? formatDate(occurredAt) : '—'}
                {count !== null && count > 1 ? ` ×${count}` : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AttemptHistory({ submission }: { submission: Submission }) {
  return (
    <section className="bg-card rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Attempt history</h3>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <HistoryItem
          label="Started"
          value={formatDate(submission.started_at)}
        />
        <HistoryItem
          label="Submitted"
          value={formatDate(submission.submitted_at)}
        />
        <HistoryItem
          label="Graded"
          value={formatDate(submission.graded_at)}
        />
        <HistoryItem
          label="Version"
          value={`v${submission.version}`}
        />
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
        <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
          No answer payload was recorded.
        </div>
      ) : (
        items.map((item, index) => (
          <div
            key={typeof item === 'object' && item !== null && 'task_uuid' in item ? String(item.task_uuid) : index}
            className="bg-card rounded-lg border p-4"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <Badge variant="secondary">Task {index + 1}</Badge>
              {typeof item === 'object' && item !== null && 'content_type' in item ? (
                <Badge variant="outline">{String(item.content_type)}</Badge>
              ) : null}
            </div>
            <pre className="bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs">
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
