'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiJson } from '@/lib/api-client'
import type { AIRunStatusPayload } from '@/features/ai-experience'

export interface SubmissionAnalysis {
  analysis_uuid: string
  gap_count: number
  status: string
  language: string
  model_name?: string | null
  analysis_json: {
    summary?: string
    confidence?: string
    citations?: unknown[]
    knowledge_gaps?: { concept: string; severity: string; remediation_goal: string }[]
  }
}

export function latestSubmissionAnalysisQueryOptions(submissionUuid: string) {
  return queryOptions({
    queryKey: ['submission-analysis', submissionUuid],
    queryFn: () => apiJson<SubmissionAnalysis | null>(`ai/submission-analysis/${submissionUuid}/latest`),
    enabled: Boolean(submissionUuid),
  })
}

export function useLatestSubmissionAnalysis(submissionUuid: string) {
  return useQuery(latestSubmissionAnalysisQueryOptions(submissionUuid))
}

export function useRunSubmissionAnalysis(submissionUuid: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (language: string) =>
      apiJson<SubmissionAnalysis>(`ai/submission-analysis/${submissionUuid}/analyze`, {
        method: 'POST',
        body: JSON.stringify({ language }),
        headers: { 'content-type': 'application/json' },
        timeoutMs: 120_000,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: latestSubmissionAnalysisQueryOptions(submissionUuid).queryKey,
      }),
  })
}

export function useQueueSubmissionAnalysis(submissionUuid: string) {
  return useMutation({
    mutationFn: (language: string) =>
      apiJson<AIRunStatusPayload>(`ai/submission-analysis/${submissionUuid}/analyze/queue`, {
        method: 'POST',
        body: JSON.stringify({ language }),
        headers: { 'content-type': 'application/json' },
      }),
  })
}
