'use client';

import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  GitCompareArrows,
  ListTodo,
  Send,
  Sparkles,
  Target,
  TextCursorInput,
} from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import type { AssessmentItem } from '@/features/assessments/domain/items';
import type { UnifiedItemKind } from '@/features/assessments/domain/items';
import { classifyValidationIssue, dedupeIssues } from '@/features/assessments/domain/readiness';
import type { ValidationIssue } from '@/features/assessments/domain/view-models';
import type { AssessmentEditorState } from '@/features/assessments/studio/studioTypes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type SupportedStudioItemKind = Exclude<UnifiedItemKind, 'CODE'>;
type AssessmentLifecycle = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';

const KIND_ICONS: Record<SupportedStudioItemKind, typeof ListTodo> = {
  CHOICE: ListTodo,
  OPEN_TEXT: BookOpen,
  FORM: TextCursorInput,
  MATCHING: GitCompareArrows,
};

interface PublishDashboardTabProps {
  assessmentUuid: string;
  lifecycle: AssessmentLifecycle;
  items: AssessmentItem[];
  totalPoints: number;
  assessmentState: AssessmentEditorState;
  validationIssues: ValidationIssue[];
  canPublish: boolean;
  canSchedule: boolean;
  canArchive: boolean;
  onSwitchToBuilder: (itemUuid?: string) => void;
  onLifecycleChange: (lifecycle: AssessmentLifecycle, scheduledAt?: string | null) => void;
}

export default function PublishDashboardTab({
  assessmentUuid,
  lifecycle,
  items,
  totalPoints,
  assessmentState,
  validationIssues,
  canPublish,
  canSchedule,
  canArchive,
  onSwitchToBuilder,
  onLifecycleChange,
}: PublishDashboardTabProps) {
  const t = useTranslations('Features.Assessments.Studio.NativeItemStudio');
  const tPublish = useTranslations('Features.Assessments.Studio.PublishDashboard');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [isPending, startTransition] = useTransition();
  const scheduleInputRef = useRef<HTMLInputElement>(null);

  // Compute all validation issues (assessment-level + item-level)
  const classifiedIssues = dedupeIssues(validationIssues).map(classifyValidationIssue);
  const hasIssues = classifiedIssues.length > 0;
  const assessmentLevelIssues = classifiedIssues.filter((issue) => !issue.itemUuid);
  const itemLevelIssues = classifiedIssues.filter((issue) => Boolean(issue.itemUuid));

  // Metrics
  const kindCounts = items.reduce(
    (acc, item) => {
      acc[item.kind as SupportedStudioItemKind] = (acc[item.kind as SupportedStudioItemKind] ?? 0) + 1;
      return acc;
    },
    {} as Record<SupportedStudioItemKind, number>,
  );

  const timeLimitMinutes = assessmentState.timeLimitMinutes ? Number(assessmentState.timeLimitMinutes) : null;
  const isPublished = lifecycle === 'PUBLISHED';
  const isScheduled = lifecycle === 'SCHEDULED';
  const isDraft = lifecycle === 'DRAFT';

  const handlePublish = () => {
    startTransition(() => {
      onLifecycleChange('PUBLISHED');
    });
  };

  const handleSchedule = () => {
    if (!scheduledAt) return;
    startTransition(() => {
      onLifecycleChange('SCHEDULED', new Date(scheduledAt).toISOString());
      setScheduleOpen(false);
      setScheduledAt('');
    });
  };

  const handleUnpublish = () => {
    startTransition(() => {
      onLifecycleChange('DRAFT');
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-6">
      {/* Status Banner */}
      <div
        className={cn(
          'flex items-center justify-between gap-4 rounded-2xl border p-5',
          isPublished
            ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
            : isScheduled
              ? 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30'
              : hasIssues
                ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
                : 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30',
        )}
      >
        <div className="flex items-center gap-3">
          {isPublished ? (
            <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" />
          ) : isScheduled ? (
            <CalendarClock className="size-6 text-blue-600 dark:text-blue-400" />
          ) : hasIssues ? (
            <AlertTriangle className="size-6 text-amber-600 dark:text-amber-400" />
          ) : (
            <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" />
          )}
          <div>
            <p className="font-semibold">
              {isPublished
                ? tPublish('statusPublished')
                : isScheduled
                  ? tPublish('statusScheduled')
                  : hasIssues
                    ? tPublish('statusHasIssues', { count: classifiedIssues.length })
                    : tPublish('statusReadyToPublish')}
            </p>
            <p className="text-muted-foreground text-sm">
              {isPublished
                ? tPublish('statusPublishedDesc')
                : isScheduled
                  ? tPublish('statusScheduledDesc')
                  : hasIssues
                    ? tPublish('statusHasIssuesDesc')
                    : tPublish('statusReadyDesc')}
            </p>
          </div>
        </div>

        {/* Publish actions */}
        <div className="flex items-center gap-2">
          {isPublished || isScheduled ? (
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={handleUnpublish}
            >
              {tPublish('revertToDraft')}
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                disabled={isPending || hasIssues || !canPublish}
                onClick={handlePublish}
              >
                <Send className="size-4" />
                {tPublish('publishNow')}
              </Button>
              <Popover
                open={scheduleOpen}
                onOpenChange={setScheduleOpen}
              >
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending || !canSchedule}
                    >
                      <CalendarClock className="size-4" />
                      {tPublish('schedule')}
                      <ChevronDown className="size-3" />
                    </Button>
                  }
                />
                <PopoverContent
                  align="end"
                  className="w-64 space-y-3 p-3"
                >
                  <p className="text-sm font-medium">{tPublish('schedulePublication')}</p>
                  <Input
                    ref={scheduleInputRef}
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={isPending || !scheduledAt || !canSchedule}
                    onClick={handleSchedule}
                  >
                    <CalendarClock className="mr-1 size-4" />
                    {tPublish('schedule')}
                  </Button>
                </PopoverContent>
              </Popover>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Exam Metrics */}
        <div className="space-y-4 lg:col-span-1">
          <h3 className="text-sm font-semibold">{tPublish('metricsTitle')}</h3>

          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              icon={BookOpen}
              label={tPublish('totalQuestions')}
              value={String(items.length)}
            />
            <MetricCard
              icon={Sparkles}
              label={tPublish('totalPoints')}
              value={String(totalPoints)}
            />
            {timeLimitMinutes ? (
              <MetricCard
                icon={Clock}
                label={tPublish('timeLimit')}
                value={tPublish('timeLimitValue', { minutes: timeLimitMinutes })}
              />
            ) : null}
            <MetricCard
              icon={Target}
              label={tPublish('attemptLimit')}
              value={assessmentState.maxAttempts || tPublish('unlimited')}
            />
          </div>

          {/* Breakdown by kind */}
          {Object.entries(kindCounts).length > 0 ? (
            <div className="bg-card rounded-xl border p-4">
              <p className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
                {tPublish('questionTypes')}
              </p>
              <div className="space-y-2">
                {(Object.entries(kindCounts) as [SupportedStudioItemKind, number][]).map(([kind, count]) => {
                  const Icon = KIND_ICONS[kind] ?? BookOpen;
                  const percent = items.length > 0 ? Math.round((count / items.length) * 100) : 0;
                  return (
                    <div
                      key={kind}
                      className="flex items-center gap-2"
                    >
                      <Icon className="text-muted-foreground size-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-xs">{kind.replaceAll('_', ' ')}</span>
                      <Badge
                        variant="secondary"
                        className="text-xs"
                      >
                        {count}
                      </Badge>
                      <div className="bg-muted h-1.5 w-16 overflow-hidden rounded-full">
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Right: Pre-flight Checklist */}
        <div className="space-y-4 lg:col-span-2">
          <h3 className="text-sm font-semibold">{tPublish('preflightTitle')}</h3>

          {!hasIssues ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-300 bg-emerald-50 p-8 text-center dark:border-emerald-800 dark:bg-emerald-950/30">
              <CheckCircle2 className="size-10 text-emerald-600 dark:text-emerald-400" />
              <p className="mt-3 font-semibold text-emerald-900 dark:text-emerald-100">{tPublish('noIssues')}</p>
              <p className="text-muted-foreground mt-1 text-sm">{tPublish('noIssuesDesc')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {assessmentLevelIssues.length > 0 ? (
                <div className="bg-card rounded-xl border p-4">
                  <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                    {tPublish('assessmentIssues')}
                  </p>
                  <div className="space-y-2">
                    {assessmentLevelIssues.map((issue, i) => (
                      <ChecklistItem
                        key={i}
                        message={issue.message}
                        onNavigate={() => onSwitchToBuilder()}
                        navigateLabel={tPublish('goToSetup')}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {itemLevelIssues.length > 0 ? (
                <div className="bg-card rounded-xl border p-4">
                  <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                    {tPublish('questionIssues')}
                  </p>
                  <div className="space-y-2">
                    {itemLevelIssues.map((issue, i) => {
                      const itemIndex = issue.itemUuid
                        ? items.findIndex((item) => item.item_uuid === issue.itemUuid)
                        : -1;
                      const itemTitle = itemIndex >= 0 ? `Q${itemIndex + 1}: ${items[itemIndex]?.title || '—'}` : null;
                      return (
                        <ChecklistItem
                          key={i}
                          message={issue.message}
                          context={itemTitle ?? undefined}
                          onNavigate={issue.itemUuid ? () => onSwitchToBuilder(issue.itemUuid) : undefined}
                          navigateLabel={tPublish('goToQuestion')}
                        />
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: string }) {
  return (
    <div className="bg-card rounded-xl border p-3">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 truncate text-lg font-bold">{value}</div>
    </div>
  );
}

function ChecklistItem({
  message,
  context,
  onNavigate,
  navigateLabel,
}: {
  message: string;
  context?: string;
  onNavigate?: () => void;
  navigateLabel?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/20">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        {context ? <p className="text-[10px] font-medium text-amber-700 dark:text-amber-300">{context}</p> : null}
        <p className="text-xs text-amber-900 dark:text-amber-200">{message}</p>
      </div>
      {onNavigate ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={onNavigate}
          className="h-auto shrink-0 p-0 text-[10px] font-medium text-amber-700 underline-offset-2 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
        >
          {navigateLabel}
          <ExternalLink className="ml-0.5 inline size-2.5" />
        </Button>
      ) : null}
    </div>
  );
}
