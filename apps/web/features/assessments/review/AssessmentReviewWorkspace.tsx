'use client';

import { useEffect, useState } from 'react';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';

import { apiFetcher } from '@/lib/api-client';
import { getAPIUrl } from '@services/config/config';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { assessmentTypeToKind } from '@/features/assessments/domain/view-models';
import { loadKindModule } from '@/features/assessments/registry';
import type { KindModule } from '@/features/assessments/registry';
import GradingReviewWorkspace from '@/features/grading/review/GradingReviewWorkspace';
import { reportClientError } from '@/services/telemetry/client';

interface AssessmentReviewWorkspaceProps {
  /** Activity UUID — route param (may include "activity_" prefix). */
  activityUuid: string;
  /** Optionally pre-select a specific submission (from ?submission= query param). */
  initialSubmissionUuid?: string | null;
}

interface AssessmentReviewDetail {
  assessment_uuid: string;
  kind: 'ASSIGNMENT' | 'EXAM' | 'CODE_CHALLENGE' | 'QUIZ';
  review_projection?: {
    assessment_uuid: string;
    activity_id: number;
    activity_uuid: string;
    title: string;
    kind: 'ASSIGNMENT' | 'EXAM' | 'CODE_CHALLENGE' | 'QUIZ';
  } | null;
}

export default function AssessmentReviewWorkspace({
  activityUuid,
  initialSubmissionUuid,
}: AssessmentReviewWorkspaceProps) {
  const cleanUuid = activityUuid.replace(/^activity_/, '');
  const [kindModule, setKindModule] = useState<KindModule | undefined>();

  const {
    data: assessment,
    isLoading,
    error,
  } = useQuery(
    queryOptions({
      queryKey: queryKeys.assessments.activity(cleanUuid),
      queryFn: () => apiFetcher(`${getAPIUrl()}assessments/activity/${cleanUuid}`) as Promise<AssessmentReviewDetail>,
      enabled: Boolean(cleanUuid),
    }),
  );

  useEffect(() => {
    const reviewProjection = assessment?.review_projection;
    if (!reviewProjection) return;
    const kind = assessmentTypeToKind(reviewProjection.kind);
    if (!kind) return;
    let cancelled = false;
    void loadKindModule(kind)
      .then((mod) => {
        if (!cancelled) setKindModule(mod);
      })
      .catch((loadError: unknown) => {
        void reportClientError({
          scope: 'assessment-flow',
          phase: 'load-review-kind-module',
          activityUuid: cleanUuid,
          assessmentUuid: assessment?.assessment_uuid,
          error: loadError instanceof Error ? loadError.message : 'Failed to load review kind module',
        }).catch(() => undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [assessment?.assessment_uuid, assessment?.review_projection, cleanUuid]);

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex min-h-[420px] items-center justify-center text-sm">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        Loading review
      </div>
    );
  }

  if (error || !assessment?.review_projection) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
        Review is unavailable for this activity.
      </div>
    );
  }

  const reviewProjection = assessment.review_projection;

  return (
    <GradingReviewWorkspace
      activityId={reviewProjection.activity_id}
      activityUuid={reviewProjection.activity_uuid}
      title={reviewProjection.title}
      initialSubmissionUuid={initialSubmissionUuid ?? null}
      initialFilter="ALL"
      kindModule={kindModule}
    />
  );
}
