'use client';

/**
 * useMySubmission
 *
 * Fetches the current student's latest submission for an activity.
 */

import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Submission } from '@/features/grading/domain/types';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { mySubmissionQueryOptions } from '@/features/grading/queries/grading.query';

export interface UseMySubmissionResult {
  submission: Submission | null;
  isLoading: boolean;
  error: Error | null;
  mutate: () => Promise<Submission[] | undefined>;
}

function mySubmissionHookOptions(activityId: number | null) {
  const normalizedActivityId = activityId ?? 0;

  return queryOptions({
    ...mySubmissionQueryOptions(normalizedActivityId),
    enabled: activityId !== null,
  });
}

export function useMySubmission(activityId: number | null): UseMySubmissionResult {
  const queryClient = useQueryClient();
  const query = useQuery(mySubmissionHookOptions(activityId));

  // Return the most recent submission (first in list — API sorts by created_at desc)
  const submission = query.data?.[0] ?? null;

  return {
    submission,
    isLoading: query.isPending,
    error: query.error ?? null,
    mutate: async () => {
      if (activityId === null) return undefined;
      await queryClient.invalidateQueries({ queryKey: queryKeys.grading.mine(activityId) });
      return queryClient.fetchQuery(mySubmissionQueryOptions(activityId));
    },
  };
}
