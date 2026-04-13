'use client';

import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { submissionStatsQueryOptions } from '@/features/grading/queries/grading.query';

function submissionStatsHookOptions(activityId: number | null) {
  const normalizedActivityId = activityId ?? 0;

  return queryOptions({
    ...submissionStatsQueryOptions(normalizedActivityId),
    enabled: activityId !== null,
  });
}

export function useSubmissionStats(activityId: number | null) {
  const queryClient = useQueryClient();
  const query = useQuery(submissionStatsHookOptions(activityId));

  return {
    stats: query.data ?? null,
    isLoading: query.isPending,
    error: query.error ?? null,
    mutate: async () => {
      if (activityId === null) return null;
      await queryClient.invalidateQueries({ queryKey: queryKeys.grading.stats(activityId) });
      return queryClient.fetchQuery(submissionStatsQueryOptions(activityId));
    },
  };
}
