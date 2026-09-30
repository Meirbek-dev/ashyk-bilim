'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createExamWithActivityMutationOptions } from './mutations'

export function useCreateExamWithActivity(
  courseUuid?: string | null,
  options?: { withUnpublishedActivities?: boolean },
) {
  const queryClient = useQueryClient()

  return useMutation(
    createExamWithActivityMutationOptions(queryClient, courseUuid, options?.withUnpublishedActivities ?? false),
  )
}
