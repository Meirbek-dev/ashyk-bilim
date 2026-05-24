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
  judge0LanguagesQueryOptions,
} from './queries';
import type { CodeChallengeSettings } from '@/services/courses/code-challenges';

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
  activityUuid: string | null | undefined,
  submissionUuid: string | null,
  options?: { refetchInterval?: number | false },
) {
  const normalizedActivityUuid = activityUuid ?? '';
  const normalizedSubmissionUuid = submissionUuid ?? '';

  return queryOptions({
    ...codeChallengeSubmissionQueryOptions(normalizedActivityUuid, normalizedSubmissionUuid),
    enabled: Boolean(activityUuid && submissionUuid),
    refetchInterval: options?.refetchInterval,
  });
}

export function useCodeChallengeSettings<TSettings = CodeChallengeSettings>(activityUuid: string | null | undefined) {
  return useQuery(codeChallengeSettingsHookOptions<TSettings>(activityUuid));
}

export function useJudge0Languages() {
  return useQuery(judge0LanguagesQueryOptions());
}

export function useCodeChallengeSubmissions(activityUuid: string | null | undefined) {
  return useQuery(codeChallengeSubmissionsHookOptions(activityUuid));
}

export function useCodeChallengeSubmission(
  activityUuid: string | null | undefined,
  submissionUuid: string | null,
  options?: { refetchInterval?: number | false },
) {
  return useQuery(codeChallengeSubmissionHookOptions(activityUuid, submissionUuid, options));
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
