import { queryOptions, skipToken } from '@tanstack/react-query'
import { apiJson } from '@/lib/api-client'
import { ifMatchHeaders } from '@/lib/api/headers'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { AccessView, AssessmentDetail, ActivityId, AttemptState } from '@/lib/api/generated/zod'
import type { SetAccessRequest } from '@/lib/api/generated/zod'
import { getMyAssessmentSubmissions } from './submission-client'
import { listOverrides } from '@/lib/api/generated/assessments/assessments'

/** The access policy; its `version` is the `If-Match` a save must echo (UX-154). */
export function getVersionedAccess(assessmentUuid: string): Promise<AccessView> {
  return apiJson(`assessments/${assessmentUuid}/access`, undefined, value => AccessView.parse(value))
}

/** `PUT …/access` with `If-Match`; a stale tab is 412 `precondition-failed`, never a silent overwrite. */
export function setVersionedAccess(
  assessmentUuid: string,
  body: SetAccessRequest,
  version: number | null,
): Promise<AccessView> {
  return apiJson(
    `assessments/${assessmentUuid}/access`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...ifMatchHeaders(version) },
      body: JSON.stringify(body),
    },
    value => AccessView.parse(value),
  )
}

export function assessmentAccessQueryOptions(assessmentUuid: string) {
  return queryOptions({
    queryKey: queryKeys.assessments.access(assessmentUuid),
    queryFn: () => getVersionedAccess(assessmentUuid),
    staleTime: 30_000,
  })
}

export function assessmentByActivityQueryOptions(activityUuid: string) {
  const normalizedUuid = activityUuid
  return queryOptions({
    queryKey: queryKeys.assessments.activity(normalizedUuid),
    queryFn: () =>
      apiJson(`activities/${ActivityId.parse(normalizedUuid)}/assessment`, undefined, value =>
        AssessmentDetail.parse(value),
      ),
    enabled: Boolean(normalizedUuid),
  })
}

/** The learner's attempt-state (can start / continue, disabled reasons); skipped until the id is known. */
export function attemptStateQueryOptions(assessmentUuid: string | null | undefined) {
  return queryOptions({
    queryKey: queryKeys.assessments.attemptState(assessmentUuid),
    queryFn: assessmentUuid
      ? ({ signal }) =>
          apiJson(`assessments/${assessmentUuid}/attempt-state`, { signal }, value => AttemptState.parse(value))
      : skipToken,
  })
}

/** The learner's own attempts, newest first; skipped until the id is known. */
export function mySubmissionsQueryOptions(assessmentUuid: string | null | undefined) {
  return queryOptions({
    queryKey: queryKeys.assessments.mySubmissions(assessmentUuid),
    queryFn: assessmentUuid ? ({ signal }) => getMyAssessmentSubmissions(assessmentUuid, signal) : skipToken,
  })
}

/** Per-learner policy overrides of an assessment. */
export function assessmentOverridesQueryOptions(assessmentUuid: string) {
  return queryOptions({
    queryKey: queryKeys.assessments.overrides(assessmentUuid),
    queryFn: ({ signal }) => listOverrides(assessmentUuid, { signal }),
  })
}
