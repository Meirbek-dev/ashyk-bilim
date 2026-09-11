'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'

import { deleteQaThread } from '@/lib/api/generated/ai/ai'

export function useDeleteQAThread(courseUuid: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (threadUuid: string) => deleteQaThread(courseUuid, threadUuid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['course-qa-threads', courseUuid] }),
  })
}
