'use client'

import { useMutation, useQuery } from '@tanstack/react-query'

import { apiFetcher, apiJson } from '@/lib/api-client'

export interface LectureReview {
  review_uuid: string
  status: string
  language: string
  suggestions_json: {
    summary?: string
    suggestions?: { suggestion_id: string; title: string; location: string; rationale: string; priority: string }[]
    citations?: unknown[]
  }
  dismissed_json?: Record<string, boolean>
}

export function useLectureReviews(courseId: number) {
  return useQuery({
    queryKey: ['lecture-ai-reviews', courseId],
    queryFn: () => apiFetcher<LectureReview[]>(`ai/lecture-authoring/${courseId}/reviews`),
    enabled: Number.isFinite(courseId),
  })
}

export function useRunLectureCritique(courseUuid: string) {
  return useMutation({
    mutationFn: (payload: { activity_uuid?: string | null; language: string }) =>
      apiJson<LectureReview>(`ai/lecture-authoring/${courseUuid}/critique`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'content-type': 'application/json' },
      }),
  })
}
