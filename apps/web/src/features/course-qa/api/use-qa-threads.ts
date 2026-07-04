'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'

import { apiFetcher } from '@/lib/api-client'

import type { QAThreadSummary } from '../lib/types'

export function qaThreadsQueryOptions(courseUuid: string) {
  return queryOptions({
    queryKey: ['course-qa-threads', courseUuid],
    queryFn: () => apiFetcher<QAThreadSummary[]>(`ai/qa/${courseUuid}/threads`),
    enabled: Boolean(courseUuid),
  })
}

export function useQAThreads(courseUuid: string) {
  return useQuery(qaThreadsQueryOptions(courseUuid))
}
