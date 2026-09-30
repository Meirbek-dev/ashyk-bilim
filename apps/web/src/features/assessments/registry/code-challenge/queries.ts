'use client'

import { queryOptions } from '@tanstack/react-query'
import { hasErrorCode } from '@/lib/api/assertSuccess'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { getCodeChallengeSettings, getJudge0Languages, getSubmissions } from '@/services/courses/code-challenges'
import type { CodeChallengeSettings, CodeSubmission } from '@/services/courses/code-challenges'

export function codeChallengeSettingsQueryOptions(activityUuid: string) {
  return queryOptions({
    queryKey: queryKeys.codeChallenges.settings(activityUuid),
    queryFn: async (): Promise<CodeChallengeSettings | null> => getCodeChallengeSettings(activityUuid),
    refetchOnWindowFocus: false,
  })
}

export function judge0LanguagesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.codeChallenges.languages(),
    queryFn: getJudge0Languages,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    // A 503 `code-runner-degraded` is a state (Judge0 down), not a blip: show it at once.
    retry: (failureCount, error) => !hasErrorCode(error, 'code-runner-degraded') && failureCount < 3,
  })
}

export function codeChallengeSubmissionsQueryOptions(activityUuid: string) {
  return queryOptions({
    queryKey: queryKeys.codeChallenges.submissions(activityUuid),
    queryFn: (): Promise<CodeSubmission[]> => getSubmissions(activityUuid),
    refetchOnWindowFocus: false,
  })
}
