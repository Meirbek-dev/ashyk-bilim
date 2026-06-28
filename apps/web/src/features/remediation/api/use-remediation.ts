'use client'

import { useMutation, useQuery } from '@tanstack/react-query'

import { apiFetcher, apiJson } from '@/lib/api-client'

export type RemediationSession = {
  session_uuid: string
  status: string
  gate_mode: boolean
  score?: number | null
  lecture_json: {
    title?: string
    micro_lecture_markdown?: string
    learning_objectives?: string[]
    citations?: unknown[]
  }
  test_json: { questions?: unknown[] }
}

export function useRemediationSession(sessionUuid: string) {
  return useQuery({
    queryKey: ['remediation-session', sessionUuid],
    queryFn: () => apiFetcher<RemediationSession>(`ai/remediation/sessions/${sessionUuid}`),
    enabled: Boolean(sessionUuid),
  })
}

export function useGenerateRemediation(submissionUuid: string) {
  return useMutation({
    mutationFn: (payload: { gate_mode: boolean; language: string }) =>
      apiJson<RemediationSession>(`ai/remediation/${submissionUuid}/generate`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'content-type': 'application/json' },
      }),
  })
}
