'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'

import { apiJson } from '@/lib/api-client'

export interface AIRunStatusPayload {
  run_uuid: string
  status: string
  model_name?: string | null
  error_code?: string | null
  run_metadata?: Record<string, unknown>
}

export function aiRunStatusQueryOptions(runUuid: string, enabled = true) {
  return queryOptions({
    queryKey: ['ai-run-status', runUuid],
    queryFn: () => apiJson<AIRunStatusPayload>(`ai/runs/${runUuid}`),
    enabled: enabled && Boolean(runUuid),
    refetchInterval: query => {
      const status = query.state.data?.status?.toLowerCase()
      return status === 'finished' || status === 'error' || status === 'aborted' ? false : 2000
    },
  })
}

export function useAIRunStatus(runUuid: string, enabled = true) {
  return useQuery(aiRunStatusQueryOptions(runUuid, enabled))
}
