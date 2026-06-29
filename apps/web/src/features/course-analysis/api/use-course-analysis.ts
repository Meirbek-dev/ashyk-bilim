'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetcher, apiJson } from '@/lib/api-client'

export interface CourseAnalysis {
  analysis_uuid: string
  public_score: number
  status: string
  language: string
  model_name?: string | null
  report_json: {
    summary?: string
    confidence?: string
    citations?: unknown[]
    recommendations?: unknown[]
  }
}

export function latestCourseAnalysisQueryOptions(courseUuid: string) {
  return queryOptions({
    queryKey: ['course-analysis', courseUuid],
    queryFn: () => apiFetcher<CourseAnalysis | null>(`ai/course-analysis/${courseUuid}/latest`),
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
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: latestCourseAnalysisQueryOptions(courseUuid).queryKey,
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
