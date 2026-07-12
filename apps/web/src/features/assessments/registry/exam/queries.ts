'use client'

import { apiJson } from '@/lib/api-client'
import { queryOptions } from '@tanstack/react-query'
import { queryKeys } from '@/lib/react-query/queryKeys'

export function examConfigQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.exams.config(),
    queryFn: () => apiJson<{ time_limit?: { min: number; max: number } }>(`assessments/exam/config`),
  })
}
