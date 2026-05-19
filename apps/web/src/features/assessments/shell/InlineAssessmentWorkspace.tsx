'use client';

import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { useAssessmentAttempt } from '@/features/assessments/hooks/useAssessment';
import { useActivityLayout } from '@/features/assessments/shell/ActivityLayoutContext';
import AssessmentLayout from '@/features/assessments/shell/AssessmentLayout';
import AttemptEntryCard from '@/features/assessments/shell/AttemptEntryCard';
import AttemptResultCard from '@/features/assessments/shell/AttemptResultCard';
import { apiFetch } from '@/lib/api-client';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface InlineAssessmentWorkspaceProps {
  activityUuid: string;
  courseUuid: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * InlineAssessmentWorkspace
 *
 * Renders the correct surface for the student's current attempt state without
 * leaving the activity page URL:
 *
 *  - PREFLIGHT (entry card): recommendedAction ∈ {start, startRevision, blocked, waitForRelease, noAction}
 *  - ACTIVE_ATTEMPT (full-width shell): recommendedAction ∈ {continueDraft, submit}
 *  - RESULT (result card): recommendedAction ∈ {viewResult}
 *
 * Layout mode and the BottomActionBar primary CTA are both registered via
 * ActivityLayoutContext so the parent shell can react without prop-drilling.
 */
export default function InlineAssessmentWorkspace({ activityUuid, courseUuid }: InlineAssessmentWorkspaceProps) {
  const { vm: assessmentData, isLoading } = useAssessmentAttempt(activityUuid);
  const { setMode, setBottomBarAction } = useActivityLayout();
  const queryClient = useQueryClient();
  const router = useRouter();
  const t = useTranslations('Features.ActivityWorkspace');
  const [isPending, setIsPending] = useState(false);

  const vm = assessmentData?.surface === 'ATTEMPT' ? assessmentData.vm : null;
  const recommendedAction = vm?.recommendedAction ?? 'noAction';

  const isPreflightMode =
    recommendedAction === 'start' ||
    recommendedAction === 'startRevision' ||
    recommendedAction === 'blocked' ||
    recommendedAction === 'waitForRelease' ||
    recommendedAction === 'noAction';

  const canAct = recommendedAction === 'start' || recommendedAction === 'startRevision';

  // ── Derive layout mode ──────────────────────────────────────────────────────

  useEffect(() => {
    const isActive = recommendedAction === 'continueDraft' || recommendedAction === 'submit';
    setMode(isActive ? 'ACTIVE_ATTEMPT' : recommendedAction === 'viewResult' ? 'RESULT' : 'PREFLIGHT');

    return () => {
      setMode('CONTENT');
    };
  }, [recommendedAction, setMode]);

  // ── Register BottomActionBar CTA for PREFLIGHT ──────────────────────────────

  useEffect(() => {
    if (!isPreflightMode || !vm) {
      setBottomBarAction(null);
      return;
    }

    if (!canAct) {
      // Blocked or waiting — no actionable CTA
      setBottomBarAction(null);
      return;
    }

    const label =
      recommendedAction === 'startRevision' ? t('startRevision') : t('startAssessment');

    const handler = async () => {
      if (!vm.assessmentUuid) return;
      setIsPending(true);
      try {
        const response = await apiFetch(`assessments/${vm.assessmentUuid}/start`, { method: 'POST' });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.assessments.activity(activityUuid) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.assessments.detail(vm.assessmentUuid) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.assessments.draft(vm.assessmentUuid) }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.studentActivity.runtime(
              courseUuid.replace(/^course_/, ''),
              activityUuid.replace(/^activity_/, ''),
            ),
          }),
        ]);
        setMode('ACTIVE_ATTEMPT');
        router.refresh();
      } catch {
        toast.error('Unable to start this activity. Please refresh and try again.');
      } finally {
        setIsPending(false);
      }
    };

    setBottomBarAction({ label, handler, isPending });

    return () => {
      setBottomBarAction(null);
    };
  }, [isPreflightMode, canAct, recommendedAction, vm, isPending, activityUuid, courseUuid, queryClient, router, setBottomBarAction, setMode, t]);

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (isLoading || !vm) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center">
        <LoaderCircle className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  // ── Routing the student to the correct surface ──────────────────────────────

  // Entry card (pre-flight) — no CTA inside, it lives in BottomActionBar
  if (isPreflightMode) {
    return <AttemptEntryCard vm={vm} />;
  }

  // Result card (post-submit)
  if (recommendedAction === 'viewResult') {
    return (
      <AttemptResultCard
        vm={vm}
        onRetry={() => {
          setMode('ACTIVE_ATTEMPT');
          void queryClient.invalidateQueries({
            queryKey: queryKeys.assessments.activity(activityUuid),
          });
        }}
        onStartRevision={() => {
          setMode('ACTIVE_ATTEMPT');
          void queryClient.invalidateQueries({
            queryKey: queryKeys.assessments.activity(activityUuid),
          });
        }}
        onNext={() => {
          router.refresh();
        }}
      />
    );
  }

  // Active attempt — full-width AssessmentLayout takeover
  return (
    <AssessmentLayout
      activityUuid={activityUuid}
      courseUuid={courseUuid}
      vm={vm}
    />
  );
}

