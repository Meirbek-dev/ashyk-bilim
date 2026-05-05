'use client';

import type { ComponentType } from 'react';
import { LoaderCircle, ShieldAlert } from 'lucide-react';

import { getSubmissionDisplayName } from '@/features/grading/domain';
import type { Submission } from '@/features/grading/domain';
import { buildSubmissionReviewViewModel, RELEASE_STATE_LABELS } from '@/features/grading/domain';
import { getSubmissionViolations } from '@/features/grading/domain/types';
import SubmissionStatusBadge from '@/features/assessments/shared/components/SubmissionStatusBadge';
import type { KindReviewDetailProps } from '@/features/assessments/registry';
import { useAssessmentAttempt } from '@/features/assessments/hooks/useAssessment';
import type { AssessmentItem, ItemAnswer } from '@/features/assessments/domain/items';
import { renderCanonicalReviewAnswer } from '@/features/assessments/shared/canonical-item-rendering';
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

  const reviewVm = buildSubmissionReviewViewModel(current);

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
              <Badge variant="outline">{RELEASE_STATE_LABELS[reviewVm.releaseState]}</Badge>
              {current.is_late ? <Badge variant="destructive">Late</Badge> : null}
            </div>
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <HistoryItem label="Release state" value={RELEASE_STATE_LABELS[reviewVm.releaseState]} />
            <HistoryItem label="Student visibility" value={reviewVm.releaseState === 'VISIBLE' || reviewVm.releaseState === 'RETURNED_FOR_REVISION' ? 'Visible now' : 'Hidden until release'} />
            <HistoryItem label="Score" value={typeof current.final_score === 'number' ? `${Math.round(current.final_score)}%` : '--'} />
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
              <SubmittedAnswers
                submission={current}
                activityUuid={activityUuid}
              />
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

export function getCanonicalAnswersByItem(submission: Submission): Record<string, ItemAnswer> {
  const answers = submission.answers_json;
  if (!answers || typeof answers !== 'object') return {};
  const answerMap = 'answers' in answers ? answers.answers : null;
  return answerMap && typeof answerMap === 'object' ? (answerMap as Record<string, ItemAnswer>) : {};
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
          const kind = v.kind ?? 'UNKNOWN';
          const occurredAt = v.occurred_at ?? '';
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

export function SubmittedAnswers({
  submission,
  activityUuid,
  answersByItem,
}: {
  submission: Submission;
  activityUuid?: string;
  answersByItem?: Record<string, ItemAnswer>;
}) {
  const { vm } = useAssessmentAttempt(activityUuid ?? null);
  const items = vm?.surface === 'ATTEMPT' ? vm.vm.items : [];
  const canonicalAnswers = answersByItem ?? getCanonicalAnswersByItem(submission);

  if (items.length === 0) {
    return (
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Submitted work</h3>
        <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
          No canonical item projection is available for this submission yet.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Submitted work</h3>
      {items.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
          No answer payload was recorded.
        </div>
      ) : (
        items.map((item: AssessmentItem, index) => (
          <div
            key={item.item_uuid ?? index}
            className="bg-card rounded-lg border p-4"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <Badge variant="secondary">Item {index + 1}</Badge>
              <Badge variant="outline">{item.kind}</Badge>
            </div>
            <p className="mb-3 text-sm font-medium">
              {item.title || ('prompt' in item.body ? item.body.prompt : `Item ${index + 1}`)}
            </p>
            {renderCanonicalReviewAnswer(item, canonicalAnswers[item.item_uuid])}
            {item.body.kind === 'OPEN_TEXT' && item.body.rubric ? <RubricSummary rubric={item.body.rubric} /> : null}
          </div>
        ))
      )}
    </section>
  );
}

function RubricSummary({ rubric }: { rubric: string }) {
  const criteria = rubric
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (criteria.length === 0) return null;

  return (
    <div className="mt-3 rounded-md border border-sky-200 bg-sky-50/70 p-3 text-sm text-sky-950">
      <div className="mb-2 font-medium">Rubric guidance</div>
      <ul className="space-y-1 text-xs">
        {criteria.map((criterion) => (
          <li key={criterion} className="flex gap-2">
            <span>•</span>
            <span>{criterion}</span>
          </li>
        ))}
      </ul>
    </div>
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
