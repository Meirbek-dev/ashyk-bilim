'use client'

import { apiJson } from '@/lib/api-client'
import { queryOptions } from '@tanstack/react-query'
import { queryKeys } from '@/lib/react-query/queryKeys'

/**
 * BLOCKED: v2 has no `assessments/exam/config` route (no equivalent found in
 * openapi.v2.json). Left pointed at the legacy path — the query 404s and
 * callers should already treat a missing config as "use defaults". See
 * report under "Blocked".
 */
export function examConfigQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.exams.config(),
    queryFn: () => apiJson<{ time_limit?: { min: number; max: number } }>(`assessments/exam/config`),
  })
}
