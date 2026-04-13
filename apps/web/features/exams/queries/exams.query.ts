'use client';

import { apiFetcher } from '@/lib/api-client';
import { queryOptions } from '@tanstack/react-query';
import { getAPIUrl } from '@services/config/config';
import { queryKeys } from '@/lib/react-query/queryKeys';

export function examActivityQueryOptions(activityUuid: string) {
  return queryOptions({
    queryKey: queryKeys.exams.activity(activityUuid),
    queryFn: () => apiFetcher(`${getAPIUrl()}exams/activity/${activityUuid}`),
  });
}

export function examDetailQueryOptions(examUuid: string) {
  return queryOptions({
    queryKey: queryKeys.exams.detail(examUuid),
    queryFn: () => apiFetcher(`${getAPIUrl()}exams/${examUuid}`),
  });
}

export function examQuestionsQueryOptions(examUuid: string) {
  return queryOptions({
    queryKey: queryKeys.exams.questions(examUuid),
    queryFn: () => apiFetcher(`${getAPIUrl()}exams/${examUuid}/questions`),
  });
}

export function examMyAttemptsQueryOptions(examUuid: string) {
  return queryOptions({
    queryKey: queryKeys.exams.myAttempt(examUuid),
    queryFn: () => apiFetcher(`${getAPIUrl()}exams/${examUuid}/attempts/me`),
  });
}

export function examAllAttemptsQueryOptions(examUuid: string) {
  return queryOptions({
    queryKey: queryKeys.exams.allAttempts(examUuid),
    queryFn: () => apiFetcher(`${getAPIUrl()}exams/${examUuid}/attempts/all`),
  });
}

export function examConfigQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.exams.config(),
    queryFn: () => apiFetcher(`${getAPIUrl()}exams/config`),
  });
}
