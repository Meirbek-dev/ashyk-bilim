'use client'

import { useMutation } from '@tanstack/react-query'

import { apiJson } from '@/lib/api-client'

export type StudyCompanionMode = 'explain' | 'practice' | 'flashcards' | 'summarize' | 'deepen'

export interface StudyCompanionAnswer {
  mode: StudyCompanionMode
  answer_markdown: string
  confidence?: string
  citations?: unknown[]
  follow_up_suggestions?: string[]
}

export function useStudyCompanion(courseUuid: string) {
  return useMutation({
    mutationFn: (payload: { question: string; mode: StudyCompanionMode; language: string }) =>
      apiJson<StudyCompanionAnswer>(`ai/study/${courseUuid}/ask`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'content-type': 'application/json' },
      }),
  })
}
