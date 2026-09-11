'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as zod from 'zod'

import { apiJson } from '@/lib/api-client'
import { hasErrorCode } from '@/lib/api/assertSuccess'
import { publishCourseAnalysis, queueCourseAnalysis, reviewCourseFinding } from '@/lib/api/generated/ai/ai'
import { CourseAnalysis } from '@/lib/api/generated/zod'
import type { FindingReviewAction } from '@/lib/api/generated/zod'

/** Known keys of the `report` blob (`CourseQualityReport` + the teacher's `finding_reviews`). */
const CourseReport = zod.looseObject({
  summary: zod.string().optional(),
  confidence: zod.string().optional(),
  citations: zod.array(zod.unknown()).optional(),
  recommendations: zod.array(zod.unknown()).optional(),
  strengths: zod.array(zod.unknown()).optional(),
  risks: zod.array(zod.unknown()).optional(),
  finding_reviews: zod.record(zod.string(), zod.looseObject({ action: zod.string() })).optional(),
})

export const CourseAnalysisView = CourseAnalysis.extend({ report: CourseReport })
export type CourseAnalysisView = zod.output<typeof CourseAnalysisView>

/** `null` body and 404 both mean "no analysis yet". */
export function parseLatestCourseAnalysis(value: unknown): CourseAnalysisView | null {
  return value === null ? null : CourseAnalysisView.parse(value)
}

export function latestCourseAnalysisQueryOptions(courseId: string) {
  return queryOptions({
    queryKey: ['course-analysis', courseId],
    queryFn: async () => {
      try {
        return await apiJson(`ai/course-analysis/${courseId}/latest`, undefined, parseLatestCourseAnalysis)
      } catch (error) {
        if (hasErrorCode(error, 'not-found')) return null
        throw error
      }
    },
    enabled: Boolean(courseId),
  })
}

export function useLatestCourseAnalysis(courseId: string) {
  return useQuery(latestCourseAnalysisQueryOptions(courseId))
}

export function useRunCourseAnalysis(courseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (language: string) =>
      apiJson(
        `ai/course-analysis/${courseId}/analyze`,
        {
          method: 'POST',
          body: JSON.stringify({ language }),
          headers: { 'content-type': 'application/json' },
          timeoutMs: 120_000,
        },
        CourseAnalysisView.parse,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: latestCourseAnalysisQueryOptions(courseId).queryKey,
      }),
  })
}

/** `202 RunStatus`; the run controller polls/streams the run and invalidates `latest`. */
export function useQueueCourseAnalysis(courseId: string) {
  return useMutation({
    mutationFn: (language: string) => queueCourseAnalysis(courseId, { language }),
  })
}

export function usePublishCourseAnalysis(courseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (analysisId: string) => publishCourseAnalysis(analysisId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: latestCourseAnalysisQueryOptions(courseId).queryKey,
      }),
  })
}

export function useReviewCourseFinding(courseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      action,
      analysisId,
      findingId,
    }: {
      action: FindingReviewAction
      analysisId: string
      findingId: string
    }) => reviewCourseFinding(analysisId, { action, finding_id: findingId, note: null }),
    onSuccess: data => {
      queryClient.setQueryData(
        latestCourseAnalysisQueryOptions(courseId).queryKey,
        CourseAnalysisView.parse(data),
      )
    },
  })
}
