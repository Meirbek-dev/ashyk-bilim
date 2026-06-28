'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'

import { apiFetcher } from '@/lib/api-client'

export type AIRunStatusPayload = {
  run_uuid: string
  status: string
  model_name?: string | null
  error_code?: string | null
}

export function aiRunStatusQueryOptions(runUuid: string, enabled = true) {
  return queryOptions({
    queryKey: ['ai-run-status', runUuid],
    queryFn: () => apiFetcher<AIRunStatusPayload>(`ai/runs/${runUuid}`),
    enabled: enabled && Boolean(runUuid),
    refetchInterval: query => {
      const status = query.state.data?.status
      return status === 'FINISHED' || status === 'ERROR' || status === 'ABORTED' ? false : 2000
    },
  })
}

export function useAIRunStatus(runUuid: string, enabled = true) {
  return useQuery(aiRunStatusQueryOptions(runUuid, enabled))
}
