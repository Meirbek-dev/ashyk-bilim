'use client'

import { queryOptions, skipToken, useQuery } from '@tanstack/react-query'

import { apiJson } from '@/lib/api-client'
import { queryKeys } from '@/lib/react-query/queryKeys'

import { AdminRunDetail, AdminRunPage, AdminSettings, EvalDashboard, UsageSummary } from '@/lib/api/generated/zod'

// Types come from the v2 contract (`AdminRunPage`, `EvalDashboard`, …);
// the legacy v1 aliases are kept for the components' prop names.
export type AIUsageSummary = UsageSummary
export type AIAdminSettings = AdminSettings
export type AIFeatureSetting = AdminSettings['features'][number]
export type AIEvalDashboard = EvalDashboard
export type AIOperationRun = AdminRunPage['items'][number]
export type AIOperationRunDetail = AdminRunDetail

export interface AIOperationFilters {
  days: number
  status?: string | undefined
  feature?: string | undefined
  provider?: string | undefined
  courseUuid?: string | undefined
}

export function aiUsageQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.ai.usage(),
    queryFn: ({ signal }) => apiJson('ai/usage', { signal }, value => UsageSummary.parse(value)),
  })
}

export function aiAdminSettingsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.ai.adminSettings(),
    queryFn: ({ signal }) => apiJson('ai/admin/settings', { signal }, value => AdminSettings.parse(value)),
  })
}

export function aiEvalDashboardQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.ai.evalDashboard(),
    queryFn: ({ signal }) => apiJson('ai/admin/evals', { signal }, value => EvalDashboard.parse(value)),
  })
}

export function aiOperationRunsQueryOptions(filters: AIOperationFilters) {
  const params = new URLSearchParams({ days: String(filters.days) })
  if (filters.status) params.set('status', filters.status)
  if (filters.feature) params.set('kind', filters.feature)
  if (filters.provider) params.set('provider', filters.provider)
  if (filters.courseUuid) params.set('course_id', filters.courseUuid)
  return queryOptions({
    queryKey: queryKeys.ai.operationRuns(filters),
    // Keyset page `{items, next_cursor}`; the console shows the first page.
    // ponytail: walk `next_cursor` (collectPages) if one window ever exceeds a page.
    queryFn: ({ signal }) =>
      apiJson(`ai/admin/runs?${params.toString()}`, { signal }, value => AdminRunPage.parse(value).items),
  })
}

export function aiOperationRunDetailQueryOptions(runUuid: string | null) {
  return queryOptions({
    queryKey: queryKeys.ai.operationRun(runUuid),
    queryFn: runUuid
      ? ({ signal }) => apiJson(`ai/admin/runs/${runUuid}`, { signal }, value => AdminRunDetail.parse(value))
      : skipToken,
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
  return useQuery(aiOperationRunsQueryOptions(filters))
}

export function useAIOperationRunDetail(runUuid: string | null) {
  return useQuery(aiOperationRunDetailQueryOptions(runUuid))
}
