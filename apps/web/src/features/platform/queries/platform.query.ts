'use client'

import { apiJson } from '@/lib/api-client'
import { queryOptions } from '@tanstack/react-query'
import type { Platform } from '@/types/platform'
import { queryKeys } from '@/lib/react-query/queryKeys'

const PLATFORM_CONFIG_STALE_TIME_MS = 15 * 60_000

export function platformConfigQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.platform.config(),
    queryFn: () => apiJson<Platform>(`platform`),
    staleTime: PLATFORM_CONFIG_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}
