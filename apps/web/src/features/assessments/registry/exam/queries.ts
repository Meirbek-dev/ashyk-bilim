'use client'

import { apiFetcher } from '@/lib/api-client'
import { queryOptions } from '@tanstack/react-query'
import { queryKeys } from '@/lib/react-query/queryKeys'

export function examConfigQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.exams.config(),
    queryFn: () => apiFetcher<{ time_limit?: { min: number; max: number } }>(`assessments/exam/config`),
  })
}
