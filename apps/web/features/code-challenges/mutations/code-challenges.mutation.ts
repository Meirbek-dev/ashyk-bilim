'use client';

import { runCustomTest, runTests, saveCodeChallengeSettings, submitCode } from '@services/courses/code-challenges';
import { mutationOptions, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';

export function runCustomTestMutationOptions(activityUuid: string) {
  return mutationOptions({
    mutationFn: (variables: { sourceCode: string; languageId: number; stdin: string }) =>
      runCustomTest(activityUuid, variables.sourceCode, variables.languageId, variables.stdin),
  });
}

export function runCodeChallengeTestsMutationOptions(activityUuid: string) {
  return mutationOptions({
    mutationFn: (variables: { sourceCode: string; languageId: number }) =>
      runTests(activityUuid, variables.sourceCode, variables.languageId),
  });
}

export function submitCodeChallengeMutationOptions(activityUuid: string, queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: (variables: { sourceCode: string; languageId: number }) =>
      submitCode(activityUuid, variables.sourceCode, variables.languageId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.codeChallenges.submissions(activityUuid) });
    },
  });
}

export function saveCodeChallengeSettingsMutationOptions(activityUuid: string, queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: (settings: Record<string, unknown>) => saveCodeChallengeSettings(activityUuid, settings),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.codeChallenges.settings(activityUuid) });
    },
  });
}
