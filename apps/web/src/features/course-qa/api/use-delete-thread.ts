'use client'

import { useMutation } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api-client'

export function useDeleteQAThread(courseUuid: string) {
  return useMutation({
    mutationFn: async (threadUuid: string) => {
      const response = await apiFetch(`ai/qa/${courseUuid}/threads/${threadUuid}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not delete Q&A thread')
    },
  })
}
