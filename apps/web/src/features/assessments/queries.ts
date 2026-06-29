import { queryOptions } from '@tanstack/react-query'
import { apiFetcher } from '@/lib/api-client'
import { queryKeys } from '@/lib/react-query/queryKeys'
import type { components } from '@/lib/api/generated/schema'

type AssessmentDetail = components['schemas']['AssessmentRead']

export function assessmentByActivityQueryOptions(activityUuid: string) {
  const normalizedUuid = activityUuid.replace(/^activity_/, '')
  return queryOptions({
    queryKey: queryKeys.assessments.activity(normalizedUuid),
    queryFn: () => apiFetcher<AssessmentDetail>(`assessments/activity/${normalizedUuid}`),
    enabled: Boolean(normalizedUuid),
  })
}
