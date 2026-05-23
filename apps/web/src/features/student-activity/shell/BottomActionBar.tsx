'use client';

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import Link from '@components/ui/AppLink';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { runStudentActivityAction, type StudentActivityRuntime } from '@/features/student-activity/api/runtime';
import { useActivityLayout } from '@/features/assessments/shell/ActivityLayoutContext';
import { queryKeys } from '@/lib/react-query/queryKeys';

type RuntimeNavItem = NonNullable<StudentActivityRuntime['next']>;
type RuntimeActionId = StudentActivityRuntime['primary_action']['id'];

// Reduced button height from h-11 / sm:h-10 down to a universal h-9 for a lower profile
const PRIMARY_BUTTON_CLASSNAME = 'h-9 min-w-0 w-full max-w-[20rem] px-4 shadow-sm';

function cleanUuid(uuid: string | null | undefined, prefix: 'course_' | 'activity_') {
  return uuid?.replace(new RegExp(`^${prefix}`), '') ?? '';
}

interface BottomActionBarProps {
  contentReadComplete?: boolean;
  courseUuid: string;
  focusMode?: boolean;
  runtime: StudentActivityRuntime;
}

/**
 * BottomActionBar
 *
 * Persistent fixed bottom bar — all viewports.
 */
export default function BottomActionBar({
  contentReadComplete = true,
  courseUuid,
  focusMode = false,
  runtime,
}: BottomActionBarProps) {
  const { mode, bottomBarAction } = useActivityLayout();
  const outlineProgress = useMemo(() => getOutlineProgress(runtime), [runtime]);

  // ACTIVE_ATTEMPT: the AssessmentLayout renders its own action controls
  if (mode === 'ACTIVE_ATTEMPT' || focusMode) return null;

  // Reduced shadow size and spread to make it visually less "tall"
  return (
    <div className="bottom-action-bar border-border/70 bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur-xl">
      <ProgressFill percent={outlineProgress} />
      {/* Reduced min-height from min-h-16 to min-h-14, and vertical padding from py-2 to py-1.5 */}
      <div className="mx-auto grid min-h-12 max-w-[96rem] grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 px-3 py-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,20rem)_minmax(0,1fr)] sm:gap-3 sm:px-4">
        <NavChevron
          courseUuid={courseUuid}
          item={runtime.previous ?? null}
          side="prev"
        />

        <div className="flex min-w-0 justify-center">
          {bottomBarAction ? (
            <OverrideCTA action={bottomBarAction} />
          ) : (
            <RuntimeCTA
              contentReadComplete={contentReadComplete}
              courseUuid={courseUuid}
              runtime={runtime}
            />
          )}
        </div>

        <NavChevron
          courseUuid={courseUuid}
          item={runtime.next ?? null}
          side="next"
        />
      </div>
    </div>
  );
}

// ── Override CTA (registered by nested components, e.g. InlineAssessmentWorkspace) ──

function OverrideCTA({ action }: { action: NonNullable<ReturnType<typeof useActivityLayout>['bottomBarAction']> }) {
  return (
    <Button
      className={PRIMARY_BUTTON_CLASSNAME}
      onClick={action.handler}
      disabled={action.disabled ?? action.isPending}
      title={action.disabledReason}
    >
      {action.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
      <span className="min-w-0 truncate">{action.label}</span>
    </Button>
  );
}

// Runtime CTA (driven by StudentActivityRuntime.primary_action)

function RuntimeCTA({
  contentReadComplete,
  courseUuid,
  runtime,
}: {
  contentReadComplete: boolean;
  courseUuid: string;
  runtime: StudentActivityRuntime;
}) {
  const t = useTranslations('ActivityPage');
  const router = useRouter();
  const completion = useRuntimeAction(courseUuid, runtime);
  const action = runtime.primary_action;

  if (action.id === 'back_to_course') {
    return (
      <Button
        className={PRIMARY_BUTTON_CLASSNAME}
        nativeButton={false}
        render={<Link href={`/course/${cleanUuid(runtime.course.uuid, 'course_')}`} />}
      >
        <ChevronLeft className="size-4" />
        <span className="min-w-0 truncate">{t('backToCourse')}</span>
      </Button>
    );
  }

  if (action.id === 'next_activity' && action.target_activity_uuid) {
    return (
      <Button
        className={PRIMARY_BUTTON_CLASSNAME}
        onClick={() =>
          router.push(
            `/course/${cleanUuid(runtime.course.uuid, 'course_')}/activity/${cleanUuid(action.target_activity_uuid, 'activity_')}`,
          )
        }
      >
        <span className="min-w-0 truncate">{t('next')}</span>
        <ChevronRight className="size-4" />
      </Button>
    );
  }

  if (action.id === 'mark_complete' || action.id === 'unmark_complete') {
    const waitingForReadCompletion = action.id === 'mark_complete' && !contentReadComplete;
    const disabledReason = waitingForReadCompletion ? t('finishReadingBeforeComplete') : undefined;

    return (
      <Button
        className={PRIMARY_BUTTON_CLASSNAME}
        onClick={() => completion.mutate(action.id === 'mark_complete' ? 'mark_complete' : 'unmark_complete')}
        disabled={!action.enabled || completion.isPending || waitingForReadCompletion}
        title={disabledReason}
      >
        {completion.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
        <span className="min-w-0 truncate">{getPrimaryActionText(action.id, t)}</span>
      </Button>
    );
  }

  if (action.id !== 'none' && action.enabled) {
    return (
      <Button
        className={PRIMARY_BUTTON_CLASSNAME}
        onClick={() =>
          document.getElementById('activity-main-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      >
        <span className="min-w-0 truncate">{getPrimaryActionText(action.id, t)}</span>
      </Button>
    );
  }

  return (
    <Button
      className={cn(
        PRIMARY_BUTTON_CLASSNAME,
        (action.reason === 'locked' || action.reason === 'unavailable') &&
          'border-destructive text-destructive hover:bg-destructive/10',
      )}
      variant="secondary"
      disabled
      title={action.reason ? getDisabledReason(action.reason, t) : undefined}
    >
      <span className="min-w-0 truncate">{action.reason ? getDisabledReason(action.reason, t) : t('noAction')}</span>
    </Button>
  );
}

// Nav controls

function NavChevron({
  courseUuid,
  item,
  side,
}: {
  courseUuid: string;
  item: RuntimeNavItem | null;
  side: 'prev' | 'next';
}) {
  const t = useTranslations('ActivityPage');
  const label = side === 'prev' ? t('previous') : t('next');
  const unavailableLabel = side === 'prev' ? t('noPreviousActivity') : t('noNextActivity');
  const Icon = side === 'prev' ? ChevronLeft : ChevronRight;

  if (!item) {
    return (
      <Button
        variant="ghost"
        disabled
        className={cn('h-9 min-w-0 px-0 sm:h-10 sm:w-full sm:px-2', side === 'prev' ? 'justify-start' : 'justify-end')}
        aria-label={unavailableLabel}
        title={unavailableLabel}
      >
        {side === 'prev' ? <Icon className="size-4" /> : null}
        <span
          className={cn(
            'hidden min-w-0 flex-col sm:flex',
            side === 'prev' ? 'items-start text-left' : 'items-end text-right',
          )}
        >
          <span className="text-[10px] leading-none font-medium">{label}</span>
          <span className="text-muted-foreground mt-0.5 max-w-36 truncate text-[11px]">{unavailableLabel}</span>
        </span>
        {side === 'next' ? <Icon className="size-4" /> : null}
      </Button>
    );
  }

  const href = `/course/${cleanUuid(courseUuid, 'course_')}/activity/${cleanUuid(item.uuid, 'activity_')}`;

  return (
    <Button
      variant="ghost"
      nativeButton={false}
      render={<Link href={href} />}
      className={cn(
        'group h-9 min-w-0 px-0 text-muted-foreground hover:text-foreground sm:h-10 sm:w-full sm:border sm:border-border/60 sm:bg-background/60 sm:px-2 sm:hover:border-primary/30 sm:hover:bg-muted/70',
        side === 'prev' ? 'justify-start' : 'justify-end',
      )}
      aria-label={
        side === 'prev'
          ? t('previousActivityTooltip', { activityName: item.title })
          : t('nextActivityTooltip', { activityName: item.title })
      }
      title={item.title}
    >
      {side === 'prev' ? <Icon className="size-4" /> : null}
      <span
        className={cn(
          'hidden min-w-0 flex-col sm:flex',
          side === 'prev' ? 'items-start text-left' : 'items-end text-right',
        )}
      >
        <span className="text-[10px] leading-none font-medium">{label}</span>
        <span className="text-foreground mt-0.5 max-w-36 truncate text-[11px] font-semibold">{item.title}</span>
      </span>
      {side === 'next' ? <Icon className="size-4" /> : null}
    </Button>
  );
}

// Helpers

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
        queryKey: queryKeys.studentActivity.runtime(
          cleanUuid(courseUuid, 'course_'),
          cleanUuid(activityUuid, 'activity_'),
        ),
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

function ProgressFill({ percent }: { percent: number }) {
  if (percent <= 0) return null;

  return (
    <div
      className="bg-border/40 absolute inset-x-0 top-0 h-[2px]"
      aria-hidden
    >
      <div
        className="bg-primary h-full transition-[width] duration-500"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function getOutlineProgress(runtime: StudentActivityRuntime) {
  const items = (runtime.outline ?? []).flatMap((chapter) => chapter.activities ?? []);
  if (items.length === 0) return 0;

  const complete = items.filter((item) => item.complete || item.state === 'complete' || item.state === 'passed').length;
  return Math.round((complete / items.length) * 100);
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
