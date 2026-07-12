'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'

import { apiJson } from '@/lib/api-client'

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

export interface AIOperationRun {
  run_uuid: string
  status: string
  feature: string
  model_name: string | null
  error_code: string | null
  duration_ms: number | null
  time_to_first_text_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  cost_estimate: number | null
  retry_count: number
  started_at: string
  completed_at: string | null
  stuck: boolean
  context: Record<string, unknown>
}

export interface AIOperationRunDetail {
  run: AIOperationRun
  events: {
    event_id: string
    sequence: number
    event_type: string
    created_at: string
    payload: Record<string, unknown>
  }[]
  artifact_uuids: string[]
}

export interface AIOperationFilters {
  days: number
  status?: string | undefined
  feature?: string | undefined
  provider?: string | undefined
  courseUuid?: string | undefined
}

export function aiUsageQueryOptions() {
  return queryOptions({
    queryKey: ['ai-usage'],
    queryFn: () => apiJson<AIUsageSummary>('ai/usage'),
  })
}

export function aiAdminSettingsQueryOptions() {
  return queryOptions({
    queryKey: ['ai-admin-settings'],
    queryFn: () => apiJson<AIAdminSettings>('ai/admin/settings'),
  })
}

export function aiEvalDashboardQueryOptions() {
  return queryOptions({
    queryKey: ['ai-eval-dashboard'],
    queryFn: () => apiJson<AIEvalDashboard>('ai/admin/evals'),
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

export function useAIOperationRuns(filters: AIOperationFilters) {
  const params = new URLSearchParams({ days: String(filters.days) })
  if (filters.status) params.set('status', filters.status)
  if (filters.feature) params.set('feature', filters.feature)
  if (filters.provider) params.set('provider', filters.provider)
  if (filters.courseUuid) params.set('course_uuid', filters.courseUuid)
  return useQuery({
    queryKey: ['ai-operation-runs', filters],
    queryFn: () => apiJson<AIOperationRun[]>(`ai/admin/runs?${params.toString()}`),
  })
}

export function useAIOperationRunDetail(runUuid: string | null) {
  return useQuery({
    queryKey: ['ai-operation-run', runUuid],
    queryFn: () => apiJson<AIOperationRunDetail>(`ai/admin/runs/${runUuid}`),
    enabled: Boolean(runUuid),
  })
}
