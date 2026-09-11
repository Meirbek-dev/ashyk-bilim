'use client'

import { mutationOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { runCustomTest, runTests, saveCodeChallengeSettings } from '@/services/courses/code-challenges'

export function runCustomTestMutationOptions(activityUuid: string) {
  return mutationOptions({
    mutationFn: (variables: { sourceCode: string; languageId: number; stdin: string }) =>
      runCustomTest(activityUuid, variables.sourceCode, variables.languageId, variables.stdin),
  })
}

export function runCodeChallengeTestsMutationOptions(activityUuid: string) {
  return mutationOptions({
    mutationFn: (variables: { sourceCode: string; languageId: number }) =>
      runTests(activityUuid, variables.sourceCode, variables.languageId),
  })
}

export function saveCodeChallengeSettingsMutationOptions(activityUuid: string, queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: (settings: Record<string, unknown>) => saveCodeChallengeSettings(activityUuid, settings),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.codeChallenges.settings(activityUuid),
      })
    },
  })
}
