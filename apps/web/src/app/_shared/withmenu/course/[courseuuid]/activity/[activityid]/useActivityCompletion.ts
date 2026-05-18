'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { markActivityAsComplete, unmarkActivityAsComplete } from '@services/courses/activity';
import { getAbsoluteUrl } from '@services/config/config';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useGamificationStore } from '@/stores/gamification';
import type { StudentActivityViewModel } from './activity-view-model';

export function useActivityCompletion(vm: StudentActivityViewModel) {
  const t = useTranslations('ActivityPage');
  const router = useRouter();
  const queryClient = useQueryClient();
  const refetchGamification = useGamificationStore((state) => state.refetch);
  const [isPending, setIsPending] = useState(false);

  const canMarkComplete = useMemo(
    () =>
      Boolean(
        vm.activity &&
          vm.permissions.isAuthenticated &&
          vm.permissions.canView &&
          !vm.state.isCourseEnd,
      ),
    [vm],
  );

  async function markComplete() {
    if (!vm.activity || isPending) return;
    try {
      setIsPending(true);
      const willCompleteAll = vm.progress.completedActivities >= vm.progress.totalActivities - 1;
      await markActivityAsComplete(vm.activity.uuid);
      await queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() });

      if (useGamificationStore.getState().profile) {
        useGamificationStore.getState().showXPToast(25, 'activity_completion');
        void refetchGamification().catch((error: unknown) =>
          console.error('Failed to refetch gamification:', error),
        );
      } else {
        toast.success(t('activityCompleted'));
      }

      if (willCompleteAll) {
        router.push(`${getAbsoluteUrl('')}/course/${vm.course.cleanUuid}/activity/end`);
      }
    } catch (error) {
      console.error('Error marking activity as complete:', error);
      toast.error(t('markCompleteError'));
    } finally {
      setIsPending(false);
    }
  }

  async function unmarkComplete() {
    if (!vm.activity || isPending) return;
    try {
      setIsPending(true);
      await unmarkActivityAsComplete(vm.activity.uuid);
      await queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() });
    } catch {
      toast.error(t('unmarkCompleteError'));
    } finally {
      setIsPending(false);
    }
  }

  return {
    canMarkComplete,
    isPending,
    markComplete,
    unmarkComplete,
  };
}
