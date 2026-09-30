'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'

import { aiGetRun } from '@/lib/api/generated/ai/ai'
import type { RunStatus } from '@/lib/api/generated/zod'

/** `GET /ai/runs/{id}` (v2 `RunStatus`); the queue endpoints answer the same shape. */
export type AIRunStatusPayload = RunStatus

export function isTerminalRunStatus(status: RunStatus['status'] | undefined) {
  return status === 'succeeded' || status === 'failed' || status === 'aborted'
}

export function aiRunStatusQueryOptions(runId: string, enabled = true) {
  return queryOptions({
    queryKey: ['ai-run-status', runId],
    queryFn: () => aiGetRun(runId),
    enabled: enabled && Boolean(runId),
    refetchInterval: query => (isTerminalRunStatus(query.state.data?.status) ? false : 2000),
  })
}

export function useAIRunStatus(runId: string, enabled = true) {
  return useQuery(aiRunStatusQueryOptions(runId, enabled))
}
