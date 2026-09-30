'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { deleteQaThread } from '@/lib/api/generated/ai/ai'
import { useApiError } from '@/hooks/useApiError'

export function useDeleteQAThread(courseUuid: string) {
  const queryClient = useQueryClient()
  const t = useTranslations('AiExperience.qaInput')
  const { toastApiError } = useApiError()
  return useMutation({
    mutationFn: (threadUuid: string) => deleteQaThread(courseUuid, threadUuid),
    onSuccess: () => {
      toast.success(t('threadDeleted'))
      return queryClient.invalidateQueries({ queryKey: ['course-qa-threads', courseUuid] })
    },
    onError: error => toastApiError(error),
  })
}
