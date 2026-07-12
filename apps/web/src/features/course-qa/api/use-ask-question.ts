'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'

import { apiJson } from '@/lib/api-client'
import type { QAMessage } from '../lib/types'

export function qaThreadQueryOptions(courseUuid: string, threadUuid: string) {
  return queryOptions({
    queryKey: ['course-qa-thread', courseUuid, threadUuid],
    queryFn: () => apiJson<QAMessage[]>(`ai/qa/${courseUuid}/threads/${threadUuid}`),
    enabled: Boolean(courseUuid && threadUuid),
  })
}

export function useQAThread(courseUuid: string, threadUuid: string) {
  return useQuery(qaThreadQueryOptions(courseUuid, threadUuid))
}
