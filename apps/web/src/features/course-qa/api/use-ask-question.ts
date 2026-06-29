'use client'

import { useMutation, useQuery } from '@tanstack/react-query'

import { apiFetcher, apiJson } from '@/lib/api-client'

import type { CourseQAResponse, QAMessage } from '../lib/types'

export function useAskCourseQuestion(courseUuid: string) {
  return useMutation({
    mutationFn: (payload: { question: string; thread_uuid?: string | null; role: string; language: string }) =>
      apiJson<CourseQAResponse>(`ai/qa/${courseUuid}/ask`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'content-type': 'application/json' },
      }),
  })
}

export function useQAThread(courseUuid: string, threadUuid: string) {
  return useQuery({
    queryKey: ['course-qa-thread', courseUuid, threadUuid],
    queryFn: () => apiFetcher<QAMessage[]>(`ai/qa/${courseUuid}/threads/${threadUuid}`),
    enabled: Boolean(courseUuid && threadUuid),
  })
}
