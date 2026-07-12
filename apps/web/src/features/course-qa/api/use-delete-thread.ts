'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiJson } from '@/lib/api-client'

export function useDeleteQAThread(courseUuid: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (threadUuid: string) => {
      await apiJson(`ai/qa/${courseUuid}/threads/${threadUuid}`, { method: 'DELETE' })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['course-qa-threads', courseUuid] }),
  })
}
