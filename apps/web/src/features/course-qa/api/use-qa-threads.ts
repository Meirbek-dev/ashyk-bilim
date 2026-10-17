'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/react-query/queryKeys'

import { qaThreads } from '@/lib/api/generated/ai/ai'

export function qaThreadsQueryOptions(courseUuid: string) {
  return queryOptions({
    queryKey: queryKeys.courseQa.threads(courseUuid),
    queryFn: ({ signal }) => qaThreads(courseUuid, undefined, { signal }),
    enabled: Boolean(courseUuid),
  })
}

export function useQAThreads(courseUuid: string) {
  return useQuery(qaThreadsQueryOptions(courseUuid))
}
