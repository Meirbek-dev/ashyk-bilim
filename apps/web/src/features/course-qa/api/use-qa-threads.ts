'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'

import { qaThreads } from '@/lib/api/generated/ai/ai'

export function qaThreadsQueryOptions(courseUuid: string) {
  return queryOptions({
    queryKey: ['course-qa-threads', courseUuid],
    queryFn: () => qaThreads(courseUuid),
    enabled: Boolean(courseUuid),
  })
}

export function useQAThreads(courseUuid: string) {
  return useQuery(qaThreadsQueryOptions(courseUuid))
}
