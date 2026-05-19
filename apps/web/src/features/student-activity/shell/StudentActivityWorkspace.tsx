'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardList,
  Code2,
  FileArchive,
  FileText,
  Focus,
  Layers,
  ListTree,
  Loader2,
  PanelLeftClose,
  PanelRightOpen,
  Video,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { Activity } from '@components/Contexts/CourseContext';
import Link from '@components/ui/AppLink';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { runStudentActivityAction, type StudentActivityRuntime } from '@/features/student-activity/api/runtime';
import { useActivityLayout } from '@/features/assessments/shell/ActivityLayoutContext';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { cn } from '@/lib/utils';

type RuntimeNavItem = NonNullable<StudentActivityRuntime['next']>;
type RuntimeState = StudentActivityRuntime['progress']['state'];
type RuntimeActionId = StudentActivityRuntime['primary_action']['id'];

interface StudentActivityWorkspaceProps {
  activity: Activity | null;
  children: React.ReactNode;
  courseUuid: string;
  onAskAi?: React.ReactNode;
  runtime: StudentActivityRuntime;
}

export default function StudentActivityWorkspace({
  activity,
  children,
  courseUuid,
  onAskAi,
  runtime,
}: StudentActivityWorkspaceProps) {
  const [readingMode, setReadingMode] = useState(false);
  const { mode } = useActivityLayout();
  const isAttemptActive = mode === 'ACTIVE_ATTEMPT';

  useEffect(() => {
    if (isAttemptActive) return;
    document.documentElement.dataset.layoutMode = readingMode ? 'focus' : 'content';
  }, [readingMode, isAttemptActive]);

  useEffect(() => {
    if (!readingMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReadingMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readingMode]);

  const isFullWidth = isAttemptActive || readingMode;

  return (
    <div className="bg-background text-foreground min-h-[calc(100dvh-4rem)]">
      {!isAttemptActive ? (
        <ActivityHeader
          onToggleReadingMode={() => setReadingMode((value) => !value)}
          readingMode={readingMode}
          runtime={runtime}
        />
      ) : null}
      <main
        className={cn(
          'mx-auto grid w-full max-w-[118rem] gap-5 px-4 pb-28 pt-4 sm:px-6 lg:px-8 xl:gap-6',
          isFullWidth
            ? 'grid-cols-1'
            : 'lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_18rem]',
          isAttemptActive && 'max-w-none px-0 pb-0 pt-0 sm:px-0 lg:px-0',
        )}
      >
        {!isFullWidth ? (
          <aside className="hidden lg:block">
            <ActivityOutline
              runtime={runtime}
              className="sticky top-20 max-h-[calc(100dvh-6rem)]"
            />
          </aside>
        ) : null}

        <section
          id="activity-main-content"
          className={cn('min-w-0', isAttemptActive && 'w-full')}
        >
          {readingMode && !isAttemptActive ? (
            <ReadingModeBar
              onExit={() => setReadingMode(false)}
              runtime={runtime}
            />
          ) : null}
          {children}
        </section>

        {!isFullWidth ? (
          <aside className="hidden xl:block">
            <ActivityActionPanel
              activity={activity}
              courseUuid={courseUuid}
              onAskAi={onAskAi}
              onToggleReadingMode={() => setReadingMode(true)}
              runtime={runtime}
            />
          </aside>
        ) : null}
      </main>
      {!isAttemptActive ? (
        <ActivityMobileActionBar
          courseUuid={courseUuid}
          runtime={runtime}
        />
      ) : null}
    </div>
  );
}

function ActivityHeader({
  onToggleReadingMode,
  readingMode,
  runtime,
}: {
  onToggleReadingMode: () => void;
  readingMode: boolean;
  runtime: StudentActivityRuntime;
}) {
  const t = useTranslations('ActivityPage');
  const position = useActivityPosition(runtime);
  return (
    <header className="border-border/70 bg-background/95 sticky top-14 z-30 border-b backdrop-blur">
      <div className="mx-auto flex w-full max-w-[118rem] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="min-w-0 space-y-1">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Link
              href={`/course/${cleanUuid(runtime.course.uuid, 'course_')}`}
              className="hover:text-foreground truncate"
            >
              {runtime.course.title}
            </Link>
            {runtime.activity?.chapter_title ? (
              <>
                <span>/</span>
                <span className="truncate">{runtime.activity.chapter_title}</span>
              </>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="min-w-0 max-w-[52rem] line-clamp-2 text-lg font-semibold tracking-tight sm:text-xl">
              {runtime.activity?.title ?? runtime.course.title}
            </h1>
            <ActivityStatusBadge state={runtime.progress.state} />
            {runtime.policy?.due_at ? <PolicyChip label={formatDate(runtime.policy.due_at)} /> : null}
            {runtime.policy?.time_limit_seconds ? (
              <PolicyChip label={formatDuration(runtime.policy.time_limit_seconds)} />
            ) : null}
          </div>
          {position ? (
            <p className="text-muted-foreground text-xs">
              {t('activityCounter', {
                current: position.current,
                total: position.total,
              })}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <MobileOutlineButton runtime={runtime} />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onToggleReadingMode}
            aria-label={readingMode ? t('exitFocusMode') : t('focusMode')}
            title={readingMode ? t('exitFocusMode') : t('focusMode')}
          >
            {readingMode ? <PanelRightOpen className="size-4" /> : <Focus className="size-4" />}
          </Button>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[118rem] px-4 pb-3 sm:px-6 lg:px-8">
        <ActivityProgressSummary runtime={runtime} />
      </div>
    </header>
  );
}

function PolicyChip({ label }: { label: string }) {
  return (
    <Badge
      variant="outline"
      className="max-w-44 truncate"
    >
      {label}
    </Badge>
  );
}

function ActivityProgressSummary({ runtime }: { runtime: StudentActivityRuntime }) {
  const t = useTranslations('ActivityPage');
  const stats = useOutlineStats(runtime);
  const percent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="bg-muted h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {t('activityCounter', {
          current: stats.completed,
          total: stats.total,
        })}
      </span>
    </div>
  );
}

function ActivityOutline({ className, runtime }: { className?: string; runtime: StudentActivityRuntime }) {
  const t = useTranslations('ActivityPage');
  const currentId = runtime.activity?.id ?? null;
  const stats = useOutlineStats(runtime);
  return (
    <nav
      aria-label={t('courseContent')}
      className={cn('border-border bg-background overflow-hidden rounded-lg border', className)}
    >
      <div className="border-border flex items-center gap-2 border-b px-3 py-3">
        <ListTree className="text-muted-foreground size-4" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{t('courseContent')}</p>
          <p className="text-muted-foreground text-xs">
            {stats.completed}/{stats.total}
          </p>
        </div>
      </div>
      <ScrollArea className="h-full">
        <div className="space-y-4 p-3">
          {(runtime.outline ?? []).map((chapter) => {
            const activities = chapter.activities ?? [];
            const completeCount = activities.filter((item) => item.complete).length;
            return (
              <section
                key={chapter.id}
                className="space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2 px-1">
                  <p className="truncate text-xs font-medium text-muted-foreground">
                    {chapter.index + 1}. {chapter.title}
                  </p>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {completeCount}/{activities.length}
                  </span>
                </div>
                <div className="space-y-1">
                  {activities.map((item) => (
                    <ActivityOutlineItem
                      key={item.id}
                      courseUuid={runtime.course.uuid}
                      current={item.id === currentId}
                      item={item}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </ScrollArea>
    </nav>
  );
}

function ActivityOutlineItem({
  courseUuid,
  current,
  item,
}: {
  courseUuid: string;
  current: boolean;
  item: RuntimeNavItem;
}) {
  const href = `/course/${cleanUuid(courseUuid, 'course_')}/activity/${cleanUuid(item.uuid, 'activity_')}`;
  const Icon = getActivityIcon(item.type);
  const complete = item.complete || item.state === 'complete' || item.state === 'passed';
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      title={item.title}
      className={cn(
        'group flex min-h-10 items-center gap-2 rounded-md px-2 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        current ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        item.state === 'locked' || !item.published ? 'opacity-70' : null,
      )}
    >
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border',
          complete ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background',
        )}
      >
        {complete ? <Check className="size-3" /> : <Icon className="size-3" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
      {item.state !== 'not_started' && !complete ? (
        <Badge
          variant="outline"
          className="h-5 max-w-20 truncate px-1.5 text-[10px]"
        >
          {item.state.replace(/_/g, ' ')}
        </Badge>
      ) : null}
      {current ? <span className="bg-primary size-1.5 rounded-full" /> : null}
    </Link>
  );
}

function ActivityActionPanel({
  activity,
  courseUuid,
  onAskAi,
  onToggleReadingMode,
  runtime,
}: {
  activity: Activity | null;
  courseUuid: string;
  onAskAi?: React.ReactNode;
  onToggleReadingMode: () => void;
  runtime: StudentActivityRuntime;
}) {
  const t = useTranslations('ActivityPage');
  return (
    <div className="sticky top-24 space-y-3">
      <section className="border-border bg-background rounded-lg border p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{t('status')}</p>
            <p className="text-muted-foreground text-xs">{getStateLabel(runtime.progress.state, t)}</p>
          </div>
          <ActivityStatusIcon state={runtime.progress.state} />
        </div>
        <PrimaryAction
          courseUuid={courseUuid}
          runtime={runtime}
        />
        {runtime.primary_action.reason ? (
          <p className="text-muted-foreground mt-2 text-xs">{getDisabledReason(runtime.primary_action.reason, t)}</p>
        ) : null}
        <PolicySummary runtime={runtime} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <NavButton
            courseUuid={courseUuid}
            item={runtime.previous ?? null}
            label={t('previous')}
            side="prev"
          />
          <NavButton
            courseUuid={courseUuid}
            item={runtime.next ?? null}
            label={t('next')}
            side="next"
          />
        </div>
      </section>
      <section className="border-border bg-background rounded-lg border p-4">
        <p className="mb-3 text-sm font-semibold">{t('support')}</p>
        <div className="grid gap-2">
          {activity && runtime.permissions.can_view ? onAskAi : null}
          <Button
            type="button"
            variant="outline"
            onClick={onToggleReadingMode}
          >
            <Focus className="size-4" />
            {t('focusMode')}
          </Button>
        </div>
      </section>
    </div>
  );
}

function PolicySummary({ runtime }: { runtime: StudentActivityRuntime }) {
  const t = useTranslations('ActivityPage');
  const policy = runtime.policy;
  const rows = [
    policy?.max_attempts ? t('attemptLimit', { count: policy.max_attempts }) : null,
    policy?.passing_score !== null && policy?.passing_score !== undefined ? t('passingScore', { score: policy.passing_score }) : null,
    policy?.grade_release_mode ? t('releaseMode', { mode: policy.grade_release_mode }) : null,
  ].filter((row): row is string => Boolean(row));

  if (rows.length === 0 && !runtime.progress.submitted_at && !runtime.progress.graded_at) return null;

  return (
    <div className="border-border mt-3 space-y-1 border-t pt-3">
      {runtime.progress.submitted_at ? (
        <p className="text-muted-foreground text-xs">{t('submittedAt', { date: formatDate(runtime.progress.submitted_at) })}</p>
      ) : null}
      {runtime.progress.graded_at ? (
        <p className="text-muted-foreground text-xs">{t('gradedAt', { date: formatDate(runtime.progress.graded_at) })}</p>
      ) : null}
      {rows.map((row) => (
        <p
          key={row}
          className="text-muted-foreground text-xs"
        >
          {row}
        </p>
      ))}
    </div>
  );
}

function PrimaryAction({ courseUuid, runtime }: { courseUuid: string; runtime: StudentActivityRuntime }) {
  const t = useTranslations('ActivityPage');
  const router = useRouter();
  const completion = useRuntimeAction(courseUuid, runtime);
  const action = runtime.primary_action;

  if (action.id === 'back_to_course') {
    return (
      <Button
        className="w-full"
        nativeButton={false}
        render={<Link href={`/course/${cleanUuid(runtime.course.uuid, 'course_')}`} />}
      >
        {t('backToCourse')}
      </Button>
    );
  }

  if (action.id === 'next_activity' && action.target_activity_uuid) {
    return (
      <Button
        className="w-full"
        onClick={() =>
          router.push(
            `/course/${cleanUuid(runtime.course.uuid, 'course_')}/activity/${cleanUuid(action.target_activity_uuid, 'activity_')}`,
          )
        }
      >
        {t('next')}
        <ChevronRight className="size-4" />
      </Button>
    );
  }

  if (action.id === 'mark_complete' || action.id === 'unmark_complete') {
    return (
      <Button
        className="w-full"
        onClick={() => completion.mutate(action.id === 'mark_complete' ? 'mark_complete' : 'unmark_complete')}
        disabled={!action.enabled || completion.isPending}
      >
        {completion.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
        {getPrimaryActionText(action.id, t)}
      </Button>
    );
  }

  if (action.id !== 'none' && action.enabled) {
    return (
      <Button
        className="w-full"
        variant={action.id === 'revise' || action.id === 'start' || action.id === 'continue' ? 'default' : 'outline'}
        onClick={() => document.getElementById('activity-main-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      >
        {getPrimaryActionIcon(action.id)}
        {getPrimaryActionText(action.id, t)}
      </Button>
    );
  }

  return (
    <Button
      className="w-full"
      variant="secondary"
      disabled
    >
      {t('noAction')}
    </Button>
  );
}

function ActivityMobileActionBar({ courseUuid, runtime }: { courseUuid: string; runtime: StudentActivityRuntime }) {
  const completion = useRuntimeAction(courseUuid, runtime);
  const router = useRouter();
  const t = useTranslations('ActivityPage');
  const action = runtime.primary_action;

  return (
    <div className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t p-3 backdrop-blur xl:hidden">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <NavIconButton
          courseUuid={courseUuid}
          item={runtime.previous ?? null}
          side="prev"
        />
        <div className="min-w-0 flex-1">
          {action.id === 'mark_complete' || action.id === 'unmark_complete' ? (
            <Button
              className="w-full"
              onClick={() => completion.mutate(action.id === 'mark_complete' ? 'mark_complete' : 'unmark_complete')}
              disabled={!action.enabled || completion.isPending}
            >
              {completion.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {getPrimaryActionText(action.id, t)}
            </Button>
          ) : action.id === 'next_activity' && action.target_activity_uuid ? (
            <Button
              className="w-full"
              onClick={() =>
                router.push(
                  `/course/${cleanUuid(runtime.course.uuid, 'course_')}/activity/${cleanUuid(action.target_activity_uuid, 'activity_')}`,
                )
              }
            >
              {t('next')}
            </Button>
          ) : action.id !== 'none' && action.enabled ? (
            <Button
              className="w-full"
              variant={action.id === 'revise' || action.id === 'start' || action.id === 'continue' ? 'default' : 'outline'}
              onClick={() =>
                document.getElementById('activity-main-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              {getPrimaryActionText(action.id, t)}
            </Button>
          ) : (
            <Button
              className="w-full"
              disabled
              variant="secondary"
            >
              {action.reason ? getDisabledReason(action.reason, t) : t('noAction')}
            </Button>
          )}
        </div>
        <NavIconButton
          courseUuid={courseUuid}
          item={runtime.next ?? null}
          side="next"
        />
      </div>
    </div>
  );
}

function useRuntimeAction(courseUuid: string, runtime: StudentActivityRuntime) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const t = useTranslations('ActivityPage');
  const activityUuid = runtime.activity?.uuid ?? '';
  return useMutation({
    mutationFn: (command: 'mark_complete' | 'unmark_complete') =>
      runStudentActivityAction(cleanUuid(courseUuid, 'course_'), cleanUuid(activityUuid, 'activity_'), {
        command,
        payload: {},
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.studentActivity.runtime(cleanUuid(courseUuid, 'course_'), cleanUuid(activityUuid, 'activity_')),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() });
      router.refresh();
      toast.success(t('activityCompleted'));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('markCompleteError'));
    },
  });
}

function MobileOutlineButton({ runtime }: { runtime: StudentActivityRuntime }) {
  const t = useTranslations('ActivityPage');
  return (
    <Sheet>
      <SheetTrigger
        render={(triggerProps) => (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label={t('courseContent')}
            {...triggerProps}
          >
            <ListTree className="size-4" />
          </Button>
        )}
      />
      <SheetContent
        side="left"
        className="w-[min(92vw,24rem)] p-0"
      >
        <SheetHeader>
          <SheetTitle>{t('courseContent')}</SheetTitle>
        </SheetHeader>
        <ActivityOutline
          runtime={runtime}
          className="mx-4 mb-4 flex-1"
        />
      </SheetContent>
    </Sheet>
  );
}

function ReadingModeBar({ onExit, runtime }: { onExit: () => void; runtime: StudentActivityRuntime }) {
  const t = useTranslations('ActivityPage');
  return (
    <div className="border-border bg-muted/30 mb-4 flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="text-muted-foreground truncate text-xs">{runtime.course.title}</p>
        <p className="truncate text-sm font-medium">{runtime.activity?.title ?? runtime.course.title}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onExit}
      >
        <PanelLeftClose className="size-4" />
        {t('exitFocusMode')}
      </Button>
    </div>
  );
}

function NavButton({
  courseUuid,
  item,
  label,
  side,
}: {
  courseUuid: string;
  item: RuntimeNavItem | null;
  label: string;
  side: 'next' | 'prev';
}) {
  if (!item) {
    return (
      <Button
        variant="secondary"
        disabled
      >
        {label}
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      nativeButton={false}
      render={<Link href={`/course/${cleanUuid(courseUuid, 'course_')}/activity/${cleanUuid(item.uuid, 'activity_')}`} />}
    >
      {side === 'prev' ? <ChevronLeft className="size-4" /> : null}
      <span className="truncate">{label}</span>
      {side === 'next' ? <ChevronRight className="size-4" /> : null}
    </Button>
  );
}

function NavIconButton({
  courseUuid,
  item,
  side,
}: {
  courseUuid: string;
  item: RuntimeNavItem | null;
  side: 'next' | 'prev';
}) {
  if (!item) {
    return (
      <Button
        variant="outline"
        size="icon"
        disabled
      >
        {side === 'prev' ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="icon"
      nativeButton={false}
      render={<Link href={`/course/${cleanUuid(courseUuid, 'course_')}/activity/${cleanUuid(item.uuid, 'activity_')}`} />}
    >
      {side === 'prev' ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
    </Button>
  );
}

function ActivityStatusBadge({ state }: { state: RuntimeState }) {
  const t = useTranslations('ActivityPage');
  const complete = state === 'complete' || state === 'passed' || state === 'published';
  const attention = state === 'returned' || state === 'failed' || state === 'locked' || state === 'unavailable';
  return (
    <Badge variant={attention ? 'destructive' : complete ? 'default' : 'secondary'}>
      {getStateLabel(state, t)}
    </Badge>
  );
}

function ActivityStatusIcon({ state }: { state: RuntimeState }) {
  if (state === 'complete' || state === 'passed' || state === 'published') {
    return <CheckCircle2 className="text-primary size-5" />;
  }
  if (state === 'submitted' || state === 'needs_grading' || state === 'graded_hidden' || state === 'returned') {
    return <ClipboardList className="text-muted-foreground size-5" />;
  }
  return <Circle className="text-muted-foreground size-5" />;
}

function getPrimaryActionIcon(actionId: RuntimeActionId) {
  switch (actionId) {
    case 'start':
    case 'continue':
      return <Layers className="size-4" />;
    case 'submit':
    case 'view_receipt':
    case 'view_feedback':
    case 'review_policy':
    case 'revise':
      return <ClipboardList className="size-4" />;
    default:
      return null;
  }
}

function getPrimaryActionText(actionId: RuntimeActionId, t: (key: string) => string): string {
  switch (actionId) {
    case 'start':
      return t('startActivity');
    case 'continue':
      return t('continueActivity');
    case 'submit':
      return t('submitButton');
    case 'view_receipt':
      return t('viewReceipt');
    case 'view_feedback':
      return t('viewResult');
    case 'revise':
      return t('needsRevision');
    case 'review_policy':
      return t('statusGradingInProgress');
    case 'next_activity':
      return t('next');
    case 'back_to_course':
      return t('backToCourse');
    case 'unmark_complete':
      return t('unmarkComplete');
    case 'mark_complete':
      return t('markAsComplete');
    default:
      return t('noAction');
  }
}

function getStateLabel(state: RuntimeState, t: (key: string) => string): string {
  switch (state) {
    case 'course_end':
      return t('courseComplete');
    case 'complete':
    case 'passed':
      return t('statusComplete');
    case 'in_progress':
    case 'viewed':
      return t('continueActivity');
    case 'draft':
      return t('draft');
    case 'submitted':
    case 'needs_grading':
      return t('submitted');
    case 'returned':
      return t('needsRevision');
    case 'graded_hidden':
      return t('statusGradingInProgress');
    case 'published':
      return t('viewResult');
    case 'failed':
      return t('failed');
    case 'locked':
      return t('accessBlocked');
    case 'attempt_exhausted':
      return t('attemptExhausted');
    case 'unavailable':
      return t('unpublishedActivity');
    default:
      return t('notStarted');
  }
}

function getDisabledReason(reason: string, t: (key: string) => string): string {
  switch (reason) {
    case 'authentication_required':
      return t('signInRequired');
    case 'unavailable':
      return t('unpublishedActivity');
    case 'locked':
      return t('accessBlocked');
    default:
      return reason.replace(/_/g, ' ');
  }
}

function getActivityIcon(type?: string | null) {
  switch (type) {
    case 'TYPE_VIDEO':
      return Video;
    case 'TYPE_DOCUMENT':
      return FileText;
    case 'TYPE_FILE_SUBMISSION':
      return FileArchive;
    case 'TYPE_EXAM':
      return ClipboardList;
    case 'TYPE_CODE_CHALLENGE':
      return Code2;
    case 'TYPE_DYNAMIC':
      return Layers;
    default:
      return BookOpen;
  }
}

function useOutlineStats(runtime: StudentActivityRuntime) {
  return useMemo(() => {
    const items = (runtime.outline ?? []).flatMap((chapter) => chapter.activities ?? []);
    return {
      completed: items.filter((item) => item.complete || item.state === 'complete' || item.state === 'passed').length,
      total: items.length,
    };
  }, [runtime.outline]);
}

function useActivityPosition(runtime: StudentActivityRuntime) {
  return useMemo(() => {
    if (!runtime.activity) return null;
    const items = (runtime.outline ?? []).flatMap((chapter) => chapter.activities ?? []);
    const index = items.findIndex((item) => item.id === runtime.activity?.id);
    return {
      current: index >= 0 ? index + 1 : 1,
      total: items.length || 1,
    };
  }, [runtime.activity, runtime.outline]);
}

function cleanUuid(uuid: string | null | undefined, prefix: 'course_' | 'activity_') {
  return uuid?.replace(new RegExp(`^${prefix}`), '') ?? '';
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
