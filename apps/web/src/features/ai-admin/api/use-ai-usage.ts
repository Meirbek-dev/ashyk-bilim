'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'

import { apiJson } from '@/lib/api-client'

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
    queryKey: ['ai-usage'],
    queryFn: () => apiJson('ai/usage', undefined, value => UsageSummary.parse(value)),
  })
}

export function aiAdminSettingsQueryOptions() {
  return queryOptions({
    queryKey: ['ai-admin-settings'],
    queryFn: () => apiJson('ai/admin/settings', undefined, value => AdminSettings.parse(value)),
  })
}

export function aiEvalDashboardQueryOptions() {
  return queryOptions({
    queryKey: ['ai-eval-dashboard'],
    queryFn: () => apiJson('ai/admin/evals', undefined, value => EvalDashboard.parse(value)),
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
  if (filters.feature) params.set('kind', filters.feature)
  if (filters.provider) params.set('provider', filters.provider)
  if (filters.courseUuid) params.set('course_id', filters.courseUuid)
  return useQuery({
    queryKey: ['ai-operation-runs', filters],
    // Keyset page `{items, next_cursor}`; the console shows the first page.
    // ponytail: walk `next_cursor` (collectPages) if one window ever exceeds a page.
    queryFn: () => apiJson(`ai/admin/runs?${params.toString()}`, undefined, value => AdminRunPage.parse(value).items),
  })
}

export function useAIOperationRunDetail(runUuid: string | null) {
  return useQuery({
    queryKey: ['ai-operation-run', runUuid],
    queryFn: () => apiJson(`ai/admin/runs/${runUuid}`, undefined, value => AdminRunDetail.parse(value)),
    enabled: Boolean(runUuid),
  })
}
