'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import {
  runCodeChallengeTestsMutationOptions,
  runCustomTestMutationOptions,
  saveCodeChallengeSettingsMutationOptions,
} from './mutations'
import {
  codeChallengeSettingsQueryOptions,
  codeChallengeSubmissionsQueryOptions,
  judge0LanguagesQueryOptions,
} from './queries'
import type { CodeChallengeSettings } from '@/services/courses/code-challenges'

function codeChallengeSettingsHookOptions(activityUuid: string | null | undefined) {
  const normalizedActivityUuid = activityUuid ?? ''

  return queryOptions({
    ...codeChallengeSettingsQueryOptions(normalizedActivityUuid),
    enabled: Boolean(activityUuid),
  })
}

function codeChallengeSubmissionsHookOptions(activityUuid: string | null | undefined) {
  const normalizedActivityUuid = activityUuid ?? ''

  return queryOptions({
    ...codeChallengeSubmissionsQueryOptions(normalizedActivityUuid),
    enabled: Boolean(activityUuid),
  })
}

export function useCodeChallengeSettings(
  activityUuid: string | null | undefined,
): UseQueryResult<CodeChallengeSettings | null> {
  return useQuery(codeChallengeSettingsHookOptions(activityUuid))
}

export function useJudge0Languages() {
  return useQuery(judge0LanguagesQueryOptions())
}

export function useCodeChallengeSubmissions(activityUuid: string | null | undefined) {
  return useQuery(codeChallengeSubmissionsHookOptions(activityUuid))
}

export function useRunCustomTest(activityUuid: string) {
  return useMutation(runCustomTestMutationOptions(activityUuid))
}

export function useRunCodeChallengeTests(activityUuid: string) {
  return useMutation(runCodeChallengeTestsMutationOptions(activityUuid))
}

export function useSaveCodeChallengeSettings(activityUuid: string) {
  const queryClient = useQueryClient()
  return useMutation(saveCodeChallengeSettingsMutationOptions(activityUuid, queryClient))
}
