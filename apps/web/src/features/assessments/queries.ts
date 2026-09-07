import { queryOptions } from '@tanstack/react-query'
import { apiJson } from '@/lib/api-client'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { AssessmentDetail, ActivityId } from '@/lib/api/generated/zod'

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
