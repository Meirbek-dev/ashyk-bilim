'use client';

import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import {
  getCodeChallengeSettings,
  getSubmission,
  getSubmissions,
  type CodeChallengeSettings,
} from '@/services/courses/code-challenges';

export function codeChallengeSettingsQueryOptions<TSettings = CodeChallengeSettings>(activityUuid: string) {
  return queryOptions({
    queryKey: queryKeys.codeChallenges.settings(activityUuid),
    queryFn: async () => (await getCodeChallengeSettings(activityUuid)) as TSettings | null,
    refetchOnWindowFocus: false,
  });
}

export function codeChallengeSubmissionsQueryOptions<TSubmission = unknown>(activityUuid: string) {
  return queryOptions({
    queryKey: queryKeys.codeChallenges.submissions(activityUuid),
    queryFn: async () => (await getSubmissions(activityUuid)) as TSubmission,
    refetchOnWindowFocus: false,
  });
}

export function codeChallengeSubmissionQueryOptions<TSubmission = unknown>(submissionUuid: string) {
  return queryOptions({
    queryKey: queryKeys.codeChallenges.submission(submissionUuid),
    queryFn: async () => (await getSubmission(submissionUuid)) as TSubmission,
    refetchOnWindowFocus: false,
  });
}
