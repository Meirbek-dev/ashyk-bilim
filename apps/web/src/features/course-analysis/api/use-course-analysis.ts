'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiJson } from '@/lib/api-client'
import type { AIRunStatusPayload } from '@/features/ai-experience'

export interface CourseAnalysis {
  analysis_uuid: string
  public_score: number
  status: string
  language: string
  created_at?: string
  model_name?: string | null
  stale?: boolean
  previous_public_score?: number | null
  report_json: {
    summary?: string
    confidence?: string
    citations?: unknown[]
    recommendations?: unknown[]
    strengths?: unknown[]
    risks?: unknown[]
    finding_reviews?: Record<string, { action: string; note?: string | null; reviewed_at: string }>
  }
}

export function latestCourseAnalysisQueryOptions(courseUuid: string) {
  return queryOptions({
    queryKey: ['course-analysis', courseUuid],
    queryFn: () => apiJson<CourseAnalysis | null>(`ai/course-analysis/${courseUuid}/latest`),
    enabled: Boolean(courseUuid),
  })
}

export function useLatestCourseAnalysis(courseUuid: string) {
  return useQuery(latestCourseAnalysisQueryOptions(courseUuid))
}

export function useRunCourseAnalysis(courseUuid: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (language: string) =>
      apiJson<CourseAnalysis>(`ai/course-analysis/${courseUuid}/analyze`, {
        method: 'POST',
        body: JSON.stringify({ language }),
        headers: { 'content-type': 'application/json' },
        timeoutMs: 120_000,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: latestCourseAnalysisQueryOptions(courseUuid).queryKey,
      }),
  })
}

export function useQueueCourseAnalysis(courseUuid: string) {
  return useMutation({
    mutationFn: (language: string) =>
      apiJson<AIRunStatusPayload>(`ai/course-analysis/${courseUuid}/analyze/queue`, {
        method: 'POST',
        body: JSON.stringify({ language }),
        headers: { 'content-type': 'application/json' },
      }),
  })
}

export function usePublishCourseAnalysis(courseUuid: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (analysisUuid: string) =>
      apiJson<CourseAnalysis>(`ai/course-analysis/${analysisUuid}/publish`, {
        method: 'POST',
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: latestCourseAnalysisQueryOptions(courseUuid).queryKey,
      }),
  })
}

export function useReviewCourseFinding(courseUuid: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      action,
      analysisUuid,
      findingId,
    }: {
      action: 'accepted' | 'dismissed' | 'task_created'
      analysisUuid: string
      findingId: string
    }) =>
      apiJson<CourseAnalysis>(`ai/course-analysis/${analysisUuid}/findings/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, finding_id: findingId, note: null }),
      }),
    onSuccess: data => {
      queryClient.setQueryData(latestCourseAnalysisQueryOptions(courseUuid).queryKey, data)
    },
  })
}
