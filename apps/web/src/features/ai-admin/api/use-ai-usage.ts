'use client'

import { useQuery } from '@tanstack/react-query'

import { apiFetcher } from '@/lib/api-client'

export type AIUsageSummary = {
  total_runs: number
  input_tokens: number
  output_tokens: number
  monthly_budget: number
  remaining_budget: number
}

export function useAIUsage() {
  return useQuery({
    queryKey: ['ai-usage'],
    queryFn: () => apiFetcher<AIUsageSummary>('ai/usage'),
  })
}
