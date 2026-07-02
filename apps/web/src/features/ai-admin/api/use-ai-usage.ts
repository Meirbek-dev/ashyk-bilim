'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'

import { apiFetcher } from '@/lib/api-client'

export interface AIUsageSummary {
  total_runs: number
  input_tokens: number
  output_tokens: number
  monthly_budget: number
  remaining_budget: number
}

export interface AIFeatureSetting {
  key: string
  enabled: boolean
  editable: boolean
  source: string
}

export interface AIAdminSettings {
  ai_enabled: boolean
  provider_ready: boolean
  model: string
  monthly_token_budget: number
  max_tokens_per_request: number
  max_output_tokens: number
  draft_mode_enabled: boolean
  features: AIFeatureSetting[]
}

export interface AIRunAggregate {
  total: number
  queued: number
  running: number
  finished: number
  error: number
  aborted: number
}

export interface AIEvalSummary {
  total: number
  passed: number
  failed: number
  average_score: number | null
}

export interface AIEvalResultRead {
  eval_uuid: string
  run_id: number | null
  dataset: string
  evaluator: string
  score: number | null
  passed: boolean | null
  details_json: Record<string, unknown>
}

export interface AIEvalDashboard {
  runs: AIRunAggregate
  evals: AIEvalSummary
  recent_evals: AIEvalResultRead[]
}

export function aiUsageQueryOptions() {
  return queryOptions({
    queryKey: ['ai-usage'],
    queryFn: () => apiFetcher<AIUsageSummary>('ai/usage'),
  })
}

export function aiAdminSettingsQueryOptions() {
  return queryOptions({
    queryKey: ['ai-admin-settings'],
    queryFn: () => apiFetcher<AIAdminSettings>('ai/admin/settings'),
  })
}

export function aiEvalDashboardQueryOptions() {
  return queryOptions({
    queryKey: ['ai-eval-dashboard'],
    queryFn: () => apiFetcher<AIEvalDashboard>('ai/admin/evals'),
  })
}

export function useAIUsage() {
  return useQuery(aiUsageQueryOptions())
}

export function useAIAdminSettings() {
  return useQuery(aiAdminSettingsQueryOptions())
}

export function useAIEvalDashboard() {
  return useQuery(aiEvalDashboardQueryOptions())
}
