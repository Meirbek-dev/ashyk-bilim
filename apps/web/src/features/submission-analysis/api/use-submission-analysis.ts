'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as zod from 'zod'

import { apiJson } from '@/lib/api-client'
import { hasErrorCode } from '@/lib/api/assertSuccess'
import { queueSubmissionAnalysis } from '@/lib/api/generated/ai/ai'
import { SubmissionAnalysis } from '@/lib/api/generated/zod'

/** Known keys of the `analysis` blob (`SubmissionAnalysisReport`). */
const SubmissionReport = zod.looseObject({
  summary: zod.string().optional(),
  confidence: zod.string().optional(),
  citations: zod.array(zod.unknown()).optional(),
  knowledge_gaps: zod
    .array(zod.looseObject({ concept: zod.string(), severity: zod.string(), remediation_goal: zod.string() }))
    .optional(),
})

export const SubmissionAnalysisView = SubmissionAnalysis.extend({ analysis: SubmissionReport })
export type SubmissionAnalysisView = zod.output<typeof SubmissionAnalysisView>

/** `null` body and 404 both mean "no analysis yet". */
export function parseLatestSubmissionAnalysis(value: unknown): SubmissionAnalysisView | null {
  return value === null ? null : SubmissionAnalysisView.parse(value)
}

export function latestSubmissionAnalysisQueryOptions(submissionId: string) {
  return queryOptions({
    queryKey: ['submission-analysis', submissionId],
    queryFn: async () => {
      try {
        return await apiJson(`ai/submission-analysis/${submissionId}/latest`, undefined, parseLatestSubmissionAnalysis)
      } catch (error) {
        if (hasErrorCode(error, 'not-found')) return null
        throw error
      }
    },
    enabled: Boolean(submissionId),
  })
}

export function useLatestSubmissionAnalysis(submissionId: string) {
  return useQuery(latestSubmissionAnalysisQueryOptions(submissionId))
}

export function useRunSubmissionAnalysis(submissionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (language: string) =>
      apiJson(
        `ai/submission-analysis/${submissionId}/analyze`,
        {
          method: 'POST',
          body: JSON.stringify({ language }),
          headers: { 'content-type': 'application/json' },
          timeoutMs: 120_000,
        },
        SubmissionAnalysisView.parse,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: latestSubmissionAnalysisQueryOptions(submissionId).queryKey,
      }),
  })
}

/** `202 RunStatus`; the run controller polls/streams the run and invalidates `latest`. */
export function useQueueSubmissionAnalysis(submissionId: string) {
  return useMutation({
    mutationFn: (language: string) => queueSubmissionAnalysis(submissionId, { language }),
  })
}
