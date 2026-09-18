'use client'

import { queryOptions, useMutation, useQuery } from '@tanstack/react-query'
import * as zod from 'zod'

import { apiJson } from '@/lib/api-client'
import { queueRemediation } from '@/lib/api/generated/ai/ai'
import { RemediationSession } from '@/lib/api/generated/zod'
import type { RemediationRequest } from '@/lib/api/generated/zod'

/** Known keys of the `lecture` blob (`RemediationBundle`; also the run artifact `content`). */
export const RemediationLecture = zod.looseObject({
  title: zod.string(),
  micro_lecture_markdown: zod.string(),
  learning_objectives: zod.array(zod.string()).optional(),
  citations: zod.array(zod.unknown()).optional(),
})
export type RemediationLecture = zod.output<typeof RemediationLecture>

export const RemediationSessionView = RemediationSession.extend({ lecture: RemediationLecture })
export type RemediationSessionView = zod.output<typeof RemediationSessionView>

export function remediationSessionQueryOptions(sessionId: string) {
  return queryOptions({
    queryKey: ['remediation-session', sessionId],
    queryFn: () => apiJson(`ai/remediation/sessions/${sessionId}`, undefined, RemediationSessionView.parse),
    enabled: Boolean(sessionId),
  })
}

export function useRemediationSession(sessionId: string) {
  return useQuery(remediationSessionQueryOptions(sessionId))
}

/**
 * The newest session on a submission / file attempt, readable by whoever may read the work — the grader's
 * gate card reads the status here (UX-115): the learner's session list is admin-only. Polls 15 s + on focus
 * so «Исправление пройдено.» shows without a reload.
 */
export function latestRemediationQueryOptions(submissionId: string) {
  return queryOptions({
    queryKey: ['remediation-latest', submissionId],
    queryFn: () =>
      apiJson(`ai/remediation/${submissionId}/latest`, undefined, value =>
        value === null ? null : RemediationSessionView.parse(value),
      ),
    enabled: Boolean(submissionId),
    refetchOnWindowFocus: 'always',
    refetchInterval: 15_000,
  })
}

export function useLatestRemediation(submissionId: string) {
  return useQuery(latestRemediationQueryOptions(submissionId))
}

export function useGenerateRemediation(submissionId: string) {
  return useMutation({
    mutationFn: (payload: RemediationRequest) =>
      apiJson(
        `ai/remediation/${submissionId}/generate`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'content-type': 'application/json' },
        },
        RemediationSessionView.parse,
      ),
  })
}

/** `202 RunStatus`; the run controller streams the run and reads the lecture from its final artifact. */
export function useQueueRemediation(submissionId: string) {
  return useMutation({
    mutationFn: (payload: RemediationRequest) => queueRemediation(submissionId, payload),
  })
}
