'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createExamWithActivityMutationOptions } from './mutations'
import { examConfigQueryOptions } from './queries'

export function useExamConfig() {
  return useQuery(examConfigQueryOptions())
}

export function useCreateExamWithActivity(
  courseUuid?: string | null,
  options?: { withUnpublishedActivities?: boolean },
) {
  const queryClient = useQueryClient()

  return useMutation(
    createExamWithActivityMutationOptions(
      queryClient,
      courseUuid,
      options?.withUnpublishedActivities ?? false,
    ),
  )
}
