'use client';

/**
 * useGradingPanel
 *
 * Single hook for loading a submission into the teacher review workspace.
 */

import type { Submission } from '@/features/grading/domain/types';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { gradingDetailQueryOptions } from '@/features/grading/queries/grading.query';

export interface UseGradingPanelResult {
  submission: Submission | null;
  isLoading: boolean;
  error: Error | null;
  mutate: () => Promise<Submission | undefined>;
}

function gradingPanelHookOptionsWithAssessment(submissionUuid: string | null, assessmentUuid?: string | null) {
  const normalizedSubmissionUuid = submissionUuid ?? '';

  return queryOptions({
    ...gradingDetailQueryOptions(normalizedSubmissionUuid, assessmentUuid ?? undefined),
    enabled: Boolean(submissionUuid),
  });
}

export function useGradingPanel(submissionUuid: string | null, assessmentUuid?: string | null): UseGradingPanelResult {
  const queryClient = useQueryClient();
  const query = useQuery(gradingPanelHookOptionsWithAssessment(submissionUuid, assessmentUuid));

  return {
    submission: query.data ?? null,
    isLoading: query.isPending,
    error: query.error ?? null,
    mutate: async () => {
      if (!submissionUuid) return undefined;
      await queryClient.invalidateQueries({
        queryKey: queryKeys.grading.detail(submissionUuid, assessmentUuid ?? ''),
      });
      return queryClient.fetchQuery(gradingDetailQueryOptions(submissionUuid, assessmentUuid ?? undefined));
    },
  };
}
