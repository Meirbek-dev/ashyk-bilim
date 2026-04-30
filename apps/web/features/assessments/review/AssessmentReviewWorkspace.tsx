'use client';

import { useEffect, useState } from 'react';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';

import { apiFetcher } from '@/lib/api-client';
import { getAPIUrl } from '@services/config/config';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { loadKindModule, type KindModule } from '@/features/assessments/registry';
import GradingReviewWorkspace from '@/features/grading/review/GradingReviewWorkspace';

interface AssessmentReviewWorkspaceProps {
  /** Activity UUID — route param (may include "activity_" prefix). */
  activityUuid: string;
  /** Optionally pre-select a specific submission (from ?submission= query param). */
  initialSubmissionUuid?: string | null;
}

interface ActivityDetail {
  id: number;
  activity_uuid: string;
  name: string;
  activity_type: string;
}

function activityTypeToRegistryKind(
  activityType: string,
): 'TYPE_ASSIGNMENT' | 'TYPE_EXAM' | 'TYPE_CODE_CHALLENGE' | 'TYPE_QUIZ' | null {
  switch (activityType) {
    case 'TYPE_ASSIGNMENT':
      return 'TYPE_ASSIGNMENT';
    case 'TYPE_EXAM':
      return 'TYPE_EXAM';
    case 'TYPE_CODE_CHALLENGE':
      return 'TYPE_CODE_CHALLENGE';
    case 'TYPE_QUIZ':
      return 'TYPE_QUIZ';
    default:
      return null;
  }
}

export default function AssessmentReviewWorkspace({
  activityUuid,
  initialSubmissionUuid,
}: AssessmentReviewWorkspaceProps) {
  const cleanUuid = activityUuid.replace(/^activity_/, '');
  const [kindModule, setKindModule] = useState<KindModule | undefined>();

  const { data: activity, isLoading, error } = useQuery(
    queryOptions({
      queryKey: queryKeys.activities.detail(cleanUuid),
      queryFn: () => apiFetcher(`${getAPIUrl()}activities/${cleanUuid}`) as Promise<ActivityDetail>,
      enabled: Boolean(cleanUuid),
    }),
  );

  useEffect(() => {
    if (!activity?.activity_type) return;
    const kind = activityTypeToRegistryKind(activity.activity_type);
    if (!kind) return;
    let cancelled = false;
    void loadKindModule(kind)
      .then((mod) => {
        if (!cancelled) setKindModule(mod);
      })
      .catch(() => {/* generic review rendering remains available */});
    return () => {
      cancelled = true;
    };
  }, [activity?.activity_type]);

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        Loading review
      </div>
    );
  }

  if (error || !activity) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        Review is unavailable for this activity.
      </div>
    );
  }

  return (
    <GradingReviewWorkspace
      activityId={activity.id}
      activityUuid={activity.activity_uuid}
      title={activity.name}
      initialSubmissionUuid={initialSubmissionUuid ?? null}
      initialFilter="ALL"
      kindModule={kindModule}
    />
  );
}
