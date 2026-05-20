'use client';

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

function cleanUuid(uuid: string | null | undefined, prefix: 'course_' | 'activity_') {
  return uuid?.replace(new RegExp(`^${prefix}`), '') ?? '';
}

interface BottomActionBarProps {
  courseUuid: string;
  focusMode?: boolean;
  runtime: StudentActivityRuntime;
}

/**
 * BottomActionBar
 *
 * Persistent fixed bottom bar — all viewports.
 *
 * Layout: [← Prev] [PRIMARY CTA] [Next →]
 *
 * Replaces both:
 * - ActivityActionPanel (right sidebar primary action + nav)
 * - ActivityMobileActionBar
 *
 * Hidden when ACTIVE_ATTEMPT mode (AssessmentLayout handles its own bar).
 * Hidden when focus mode (data-layout-mode="focus").
 */
export default function BottomActionBar({ courseUuid, focusMode = false, runtime }: BottomActionBarProps) {
  const { mode, bottomBarAction } = useActivityLayout();

  // ACTIVE_ATTEMPT: the AssessmentLayout renders its own action controls
  if (mode === 'ACTIVE_ATTEMPT' || focusMode) return null;

  return (
    <div className="bottom-action-bar border-border bg-background/95 fixed inset-x-0 bottom-0 z-40 h-16 border-t backdrop-blur">
      <div className="mx-auto flex h-full max-w-4xl items-center gap-3 px-4">
        {/* Prev nav */}
        <NavChevron
          courseUuid={courseUuid}
          item={runtime.previous ?? null}
          side="prev"
        />

        {/* Primary CTA */}
        <div className="flex flex-1 justify-center">
          {bottomBarAction ? (
            <OverrideCTA action={bottomBarAction} />
          ) : (
            <RuntimeCTA
              courseUuid={courseUuid}
              runtime={runtime}
            />
          )}
        </div>

        {/* Next nav */}
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
      size="lg"
      className="w-full max-w-xs"
      onClick={action.handler}
      disabled={action.disabled ?? action.isPending}
      title={action.disabledReason}
    >
      {action.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
      {action.label}
    </Button>
  );
}

// ── Runtime CTA (driven by StudentActivityRuntime.primary_action) ────────────

function RuntimeCTA({ courseUuid, runtime }: { courseUuid: string; runtime: StudentActivityRuntime }) {
  const t = useTranslations('ActivityPage');
  const router = useRouter();
  const completion = useRuntimeAction(courseUuid, runtime);
  const action = runtime.primary_action;

  if (action.id === 'back_to_course') {
    return (
      <Button
        size="lg"
        className="w-full max-w-xs"
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
        size="lg"
        className="w-full max-w-xs"
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
        size="lg"
        className="w-full max-w-xs"
        onClick={() => completion.mutate(action.id === 'mark_complete' ? 'mark_complete' : 'unmark_complete')}
        disabled={!action.enabled || completion.isPending}
      >
        {completion.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
        {getPrimaryActionText(action.id, t)}
      </Button>
    );
  }

  if (action.id !== 'none' && action.enabled) {
    // For assessment-type activities, the BottomActionBar override handles the real start.
    // For other types (e.g. the action scrolls to content), render the action button.
    return (
      <Button
        size="lg"
        className="w-full max-w-xs"
        onClick={() =>
          document.getElementById('activity-main-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      >
        {getPrimaryActionText(action.id, t)}
      </Button>
    );
  }

  // Disabled / no-action state
  return (
    <Button
      size="lg"
      className={cn(
        'w-full max-w-xs',
        (action.reason === 'locked' || action.reason === 'unavailable') &&
          'border-destructive text-destructive hover:bg-destructive/10',
      )}
      variant="secondary"
      disabled
      title={action.reason ? getDisabledReason(action.reason, t) : undefined}
    >
      {action.reason ? getDisabledReason(action.reason, t) : t('noAction')}
    </Button>
  );
}

// ── Nav chevron ───────────────────────────────────────────────────────────────

function NavChevron({
  courseUuid,
  item,
  side,
}: {
  courseUuid: string;
  item: RuntimeNavItem | null;
  side: 'prev' | 'next';
}) {
  if (!item) {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        className="shrink-0"
        aria-hidden
      >
        {side === 'prev' ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
      </Button>
    );
  }

  const href = `/course/${cleanUuid(courseUuid, 'course_')}/activity/${cleanUuid(item.uuid, 'activity_')}`;

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        nativeButton={false}
        render={<Link href={href} />}
        title={item.title}
      >
        {side === 'prev' ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
      </Button>
      {/* Activity title — shown on sm+ */}
      <span className="text-muted-foreground hidden max-w-[9rem] truncate text-xs sm:block">{item.title}</span>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
