'use client';

import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { useAssessmentAttempt } from '@/features/assessments/hooks/useAssessment';
import { useActivityLayout } from '@/features/assessments/shell/ActivityLayoutContext';
import AssessmentLayout from '@/features/assessments/shell/AssessmentLayout';
import AttemptEntryCard from '@/features/assessments/shell/AttemptEntryCard';
import AttemptResultCard from '@/features/assessments/shell/AttemptResultCard';
import { queryKeys } from '@/lib/react-query/queryKeys';

// ── Types ─────────────────────────────────────────────────────────────────────

interface InlineAssessmentWorkspaceProps {
  activityUuid: string;
  courseUuid: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * InlineAssessmentWorkspace
 *
 * Replaces the old AssessmentHandoff card. Renders the correct surface for
 * the student's current attempt state without leaving the activity page URL:
 *
 *  - PREFLIGHT (entry card): recommendedAction ∈ {start, startRevision, blocked, waitForRelease, noAction}
 *  - ACTIVE_ATTEMPT (full-width shell): recommendedAction ∈ {continueDraft, submit}
 *  - RESULT (result card): recommendedAction ∈ {viewResult}
 *
 * Layout mode is synced to ActivityLayoutContext so the parent grid and nav
 * collapse / expand correctly.
 */
export default function InlineAssessmentWorkspace({ activityUuid, courseUuid }: InlineAssessmentWorkspaceProps) {
  const { vm: assessmentData, isLoading } = useAssessmentAttempt(activityUuid);
  const { setMode } = useActivityLayout();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const vm = assessmentData?.surface === 'ATTEMPT' ? assessmentData.vm : null;
  const recommendedAction = vm?.recommendedAction ?? 'noAction';

  // ── Derive layout mode ──────────────────────────────────────────────────────

  useEffect(() => {
    const isActive = recommendedAction === 'continueDraft' || recommendedAction === 'submit';
    setMode(isActive ? 'ACTIVE_ATTEMPT' : recommendedAction === 'viewResult' ? 'RESULT' : 'PREFLIGHT');

    return () => {
      // Reset to CONTENT when unmounting (e.g. nav to different activity)
      setMode('CONTENT');
    };
  }, [recommendedAction, setMode]);

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (isLoading || !vm) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center">
        <LoaderCircle className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  // ── Routing the student to the correct surface ──────────────────────────────

  // Entry card (pre-flight)
  if (recommendedAction === 'start' || recommendedAction === 'startRevision' || recommendedAction === 'blocked' || recommendedAction === 'waitForRelease' || recommendedAction === 'noAction') {
    return (
      <AttemptEntryCard
        vm={vm}
        isPending={isPending}
        onStart={async () => {
          // The actual start happens inside the AttemptShell/kind module when
          // it calls the backend to create a draft. We just need to flip the
          // layout mode to ACTIVE_ATTEMPT so the full shell renders.
          setIsPending(true);
          setMode('ACTIVE_ATTEMPT');
          // Re-fetch so recommendedAction moves to continueDraft
          await queryClient.invalidateQueries({
            queryKey: queryKeys.assessments.activity(activityUuid),
          });
          setIsPending(false);
        }}
      />
    );
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
          // Navigate to course to let trail redirect to next activity
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
