'use client';

import { useMemo, useState } from 'react';
import { CheckCircle, ChevronLeft, ChevronRight, Circle, Edit2, Loader2, Maximize2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';

import type { Activity, CourseStructure } from '@components/Contexts/CourseContext';
import ActivityChapterDropdown from '@components/Pages/Activity/ActivityChapterDropdown';
import { markActivityAsComplete, unmarkActivityAsComplete } from '@services/courses/activity';
import { getAbsoluteUrl } from '@services/config/config';
import Link from '@components/ui/AppLink';
import { useSession } from '@/hooks/useSession';
import { useContributorStatus } from '@/hooks/useContributorStatus';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useGamificationStore } from '@/stores/gamification';
import { buildCourseActivityIndex } from '@/lib/course-activity-index';
import { useTrailCurrent } from '@/features/trail/hooks/useTrail';

const AIActivityAsk = dynamic(() => import('@components/Objects/Activities/AI/AIActivityAsk'), { ssr: false });

interface ActivityToolbarProps {
  activity: Activity;
  activityid: string;
  course: CourseStructure;
  courseuuid: string;
  showFocusButton?: boolean;
  showMarkComplete?: boolean;
  showNavigation?: boolean;
  onEnterFocus?: () => void;
}

export default function ActivityToolbar({
  activity,
  activityid,
  course,
  courseuuid,
  showFocusButton = true,
  showMarkComplete = true,
  showNavigation = true,
  onEnterFocus,
}: ActivityToolbarProps) {
  const t = useTranslations('ActivityPage');
  const { isAuthenticated } = useSession();
  const { contributorStatus } = useContributorStatus(course.course_uuid);
  const { data: trailData } = useTrailCurrent({ enabled: isAuthenticated });
  const canView = activity.published === true || contributorStatus === 'ACTIVE';

  if (!canView || !isAuthenticated) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {showNavigation ? (
        <PreviousActivityButton
          course={course}
          currentActivityId={activity.id}
        />
      ) : (
        <span />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <AIActivityAsk activity={activity} />
        <ActivityChapterDropdown
          course={course}
          currentActivityId={activity.activity_uuid?.replace('activity_', '') ?? activityid.replace('activity_', '')}
          trailData={trailData}
        />
        {showFocusButton && onEnterFocus ? (
          <button
            type="button"
            onClick={onEnterFocus}
            className="border-border bg-background text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors"
          >
            <Maximize2 size={14} />
            {t('focusMode')}
          </button>
        ) : null}
        {contributorStatus === 'ACTIVE' && activity.activity_type === 'TYPE_DYNAMIC' ? (
          <Link
            prefetch={false}
            href={`${getAbsoluteUrl('')}/course/${courseuuid}/activity/${activityid}/edit`}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            <Edit2 size={14} />
            {t('contribute')}
          </Link>
        ) : null}
        {showMarkComplete && activity.activity_type !== 'TYPE_ASSIGNMENT' ? (
          <MarkStatus
            activity={activity}
            course={course}
            trailData={trailData}
          />
        ) : null}
      </div>

      {showNavigation ? (
        <NextActivityButton
          course={course}
          currentActivityId={activity.id}
        />
      ) : null}
    </div>
  );
}

function MarkStatus({ activity, course, trailData }: { activity: Activity; course: CourseStructure; trailData: any }) {
  const t = useTranslations('ActivityPage');
  const router = useRouter();
  const queryClient = useQueryClient();
  const refetchGamification = useGamificationStore((s) => s.refetch);
  const [isLoading, setIsLoading] = useState(false);
  const cleanCourseUuid = course.course_uuid?.replace('course_', '');
  const completedActivityIds = useMemo(() => {
    const run = trailData?.runs?.find((candidateRun: any) => {
      const runCourseUuid = candidateRun.course?.course_uuid ?? candidateRun.course_uuid;
      return runCourseUuid?.replace('course_', '') === cleanCourseUuid;
    });

    return new Set(
      (run?.steps ?? [])
        .filter((step: any) => step.complete === true && typeof step.activity_id === 'number')
        .map((step: any) => step.activity_id),
    );
  }, [cleanCourseUuid, trailData]);
  const totalActivityCount = useMemo(
    () => course.chapters?.reduce((count: number, chapter: any) => count + (chapter.activities?.length ?? 0), 0) ?? 0,
    [course.chapters],
  );
  const isActivityCompleted = completedActivityIds.has(activity.id);

  if (!trailData) return null;

  async function markComplete() {
    try {
      setIsLoading(true);
      const willCompleteAll = completedActivityIds.size >= totalActivityCount - 1;
      await markActivityAsComplete(activity.activity_uuid);
      await queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() });

      if (useGamificationStore.getState().profile) {
        useGamificationStore.getState().showXPToast(25, 'activity_completion');
        refetchGamification().catch((error: unknown) => console.error('Failed to refetch gamification:', error));
      } else {
        toast.success(t('activityCompleted'));
      }

      if (willCompleteAll) {
        router.push(`${getAbsoluteUrl('')}/course/${cleanCourseUuid}/activity/end`);
      }
    } catch (error) {
      console.error('Error marking activity as complete:', error);
      toast.error(t('markCompleteError'));
    } finally {
      setIsLoading(false);
    }
  }

  async function unmarkComplete() {
    try {
      setIsLoading(true);
      await unmarkActivityAsComplete(activity.activity_uuid);
      await queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() });
    } catch {
      toast.error(t('unmarkCompleteError'));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={isLoading ? undefined : isActivityCompleted ? unmarkComplete : markComplete}
      disabled={isLoading}
      className={
        isActivityCompleted
          ? 'inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60'
          : 'border-border bg-background text-foreground hover:bg-muted inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60'
      }
    >
      {isLoading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : isActivityCompleted ? (
        <CheckCircle size={14} />
      ) : (
        <Circle size={14} />
      )}
      {isLoading ? t('marking') : isActivityCompleted ? t('statusComplete') : t('markAsComplete')}
    </button>
  );
}

function NextActivityButton({ course, currentActivityId }: { course: CourseStructure; currentActivityId: number }) {
  const router = useRouter();
  const activityIndex = useMemo(() => buildCourseActivityIndex<Activity>(course.chapters), [course.chapters]);
  const currentIndex = activityIndex.indexByActivityId.get(currentActivityId) ?? -1;
  const nextActivity =
    currentIndex >= 0 && currentIndex < activityIndex.allActivities.length - 1
      ? activityIndex.allActivities[currentIndex + 1]
      : null;

  if (!nextActivity) return null;

  return (
    <button
      type="button"
      onClick={() =>
        router.push(
          `${getAbsoluteUrl('')}/course/${course.course_uuid?.replace('course_', '')}/activity/${nextActivity.cleanUuid}`,
        )
      }
      className="bg-muted text-foreground hover:bg-muted/80 inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors"
    >
      <span className="max-w-[180px] truncate">{nextActivity.name}</span>
      <ChevronRight size={14} />
    </button>
  );
}

function PreviousActivityButton({ course, currentActivityId }: { course: CourseStructure; currentActivityId: number }) {
  const router = useRouter();
  const activityIndex = useMemo(() => buildCourseActivityIndex<Activity>(course.chapters), [course.chapters]);
  const currentIndex = activityIndex.indexByActivityId.get(currentActivityId) ?? -1;
  const previousActivity = currentIndex > 0 ? activityIndex.allActivities[currentIndex - 1] : null;

  if (!previousActivity) return null;

  return (
    <button
      type="button"
      onClick={() =>
        router.push(
          `${getAbsoluteUrl('')}/course/${course.course_uuid?.replace('course_', '')}/activity/${previousActivity.cleanUuid}`,
        )
      }
      className="border-border bg-background text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium transition-colors"
    >
      <ChevronLeft size={14} />
      <span className="max-w-[180px] truncate">{previousActivity.name}</span>
    </button>
  );
}
