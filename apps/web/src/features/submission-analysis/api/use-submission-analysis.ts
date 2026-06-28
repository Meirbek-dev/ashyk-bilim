'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetcher, apiJson } from '@/lib/api-client'

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

export function useLatestSubmissionAnalysis(submissionUuid: string) {
  return useQuery({
    queryKey: ['submission-analysis', submissionUuid],
    queryFn: () => apiFetcher<SubmissionAnalysis | null>(`ai/submission-analysis/${submissionUuid}/latest`),
    enabled: Boolean(submissionUuid),
  })
}

export function useRunSubmissionAnalysis(submissionUuid: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (language: string) =>
      apiJson<SubmissionAnalysis>(`ai/submission-analysis/${submissionUuid}/analyze`, {
        method: 'POST',
        body: JSON.stringify({ language }),
        headers: { 'content-type': 'application/json' },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['submission-analysis', submissionUuid] }),
  })
}
