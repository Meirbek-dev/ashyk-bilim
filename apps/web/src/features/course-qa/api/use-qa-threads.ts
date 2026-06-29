'use client'

import { useQuery } from '@tanstack/react-query'

import { apiFetcher } from '@/lib/api-client'

import type { QAMessage } from '../lib/types'

export function useQAThreads(courseUuid: string) {
  return useQuery({
    queryKey: ['course-qa-threads', courseUuid],
    queryFn: () => apiFetcher<QAMessage[]>(`ai/qa/${courseUuid}/threads`),
    enabled: Boolean(courseUuid),
  })
}
