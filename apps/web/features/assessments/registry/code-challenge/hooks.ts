'use client';

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  runCodeChallengeTestsMutationOptions,
  runCustomTestMutationOptions,
  saveCodeChallengeSettingsMutationOptions,
  submitCodeChallengeMutationOptions,
} from './mutations';
import {
  codeChallengeSettingsQueryOptions,
  codeChallengeSubmissionQueryOptions,
  codeChallengeSubmissionsQueryOptions,
} from './queries';

function codeChallengeSettingsHookOptions<TSettings = unknown>(activityUuid: string | null | undefined) {
  const normalizedActivityUuid = activityUuid ?? '';

  return queryOptions({
    ...codeChallengeSettingsQueryOptions<TSettings>(normalizedActivityUuid),
    enabled: Boolean(activityUuid),
  });
}

function codeChallengeSubmissionsHookOptions(activityUuid: string | null | undefined) {
  const normalizedActivityUuid = activityUuid ?? '';

  return queryOptions({
    ...codeChallengeSubmissionsQueryOptions(normalizedActivityUuid),
    enabled: Boolean(activityUuid),
  });
}

function codeChallengeSubmissionHookOptions(
  submissionUuid: string | null,
  options?: { refetchInterval?: number | false },
) {
  const normalizedSubmissionUuid = submissionUuid ?? '';

  return queryOptions({
    ...codeChallengeSubmissionQueryOptions(normalizedSubmissionUuid),
    enabled: Boolean(submissionUuid),
    refetchInterval: options?.refetchInterval,
  });
}

export function useCodeChallengeSettings<TSettings = unknown>(activityUuid: string | null | undefined) {
  return useQuery(codeChallengeSettingsHookOptions<TSettings>(activityUuid));
}

export function useCodeChallengeSubmissions(activityUuid: string | null | undefined) {
  return useQuery(codeChallengeSubmissionsHookOptions(activityUuid));
}

export function useCodeChallengeSubmission(
  submissionUuid: string | null,
  options?: { refetchInterval?: number | false },
) {
  return useQuery(codeChallengeSubmissionHookOptions(submissionUuid, options));
}

export function useRunCustomTest(activityUuid: string) {
  return useMutation(runCustomTestMutationOptions(activityUuid));
}

export function useRunCodeChallengeTests(activityUuid: string) {
  return useMutation(runCodeChallengeTestsMutationOptions(activityUuid));
}

export function useSubmitCodeChallenge(activityUuid: string) {
  const queryClient = useQueryClient();
  return useMutation(submitCodeChallengeMutationOptions(activityUuid, queryClient));
}

export function useSaveCodeChallengeSettings(activityUuid: string) {
  const queryClient = useQueryClient();
  return useMutation(saveCodeChallengeSettingsMutationOptions(activityUuid, queryClient));
}
