import { queryOptions } from '@tanstack/react-query'
import { apiJson, apiResult } from '@/lib/api-client'
import { ifMatchHeaders, parseEntityTagVersion } from '@/lib/api/headers'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { AccessView, AssessmentDetail, ActivityId } from '@/lib/api/generated/zod'
import type { SetAccessRequest } from '@/lib/api/generated/zod'

/** The access policy plus the `ETag` version its save must echo (UX-154). */
export type VersionedAccessView = AccessView & { version: number | null }

async function versioned(promise: ReturnType<typeof apiResult<AccessView>>): Promise<VersionedAccessView> {
  const { data, headers } = await promise
  return { ...data, version: parseEntityTagVersion(headers) }
}

export function getVersionedAccess(assessmentUuid: string): Promise<VersionedAccessView> {
  return versioned(apiResult(`assessments/${assessmentUuid}/access`, undefined, AccessView.parse))
}

/** `PUT …/access` with `If-Match`; a stale tab is 412 `precondition-failed`, never a silent overwrite. */
export function setVersionedAccess(
  assessmentUuid: string,
  body: SetAccessRequest,
  version: number | null,
): Promise<VersionedAccessView> {
  return versioned(
    apiResult(
      `assessments/${assessmentUuid}/access`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...ifMatchHeaders(version) },
        body: JSON.stringify(body),
      },
      AccessView.parse,
    ),
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
