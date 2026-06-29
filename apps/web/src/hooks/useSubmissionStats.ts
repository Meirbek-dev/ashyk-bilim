'use client'

import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { submissionStatsQueryOptions } from '@/features/grading/queries/grading.query'

function submissionStatsHookOptions(activityId: number | null, assessmentUuid?: string | null) {
  return queryOptions({
    ...submissionStatsQueryOptions(assessmentUuid ?? ''),
    enabled: activityId !== null && Boolean(assessmentUuid),
  })
}

export function useSubmissionStats(activityId: number | null, assessmentUuid?: string | null) {
  const queryClient = useQueryClient()
  const query = useQuery(submissionStatsHookOptions(activityId, assessmentUuid))

  return {
    stats: query.data ?? null,
    isLoading: query.isPending,
    error: query.error ?? null,
    mutate: async () => {
      if (activityId === null || !assessmentUuid) return null
      await queryClient.invalidateQueries({
        queryKey: queryKeys.grading.stats(assessmentUuid),
      })
      return queryClient.fetchQuery(submissionStatsQueryOptions(assessmentUuid))
    },
  }
}
