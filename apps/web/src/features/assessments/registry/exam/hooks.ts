'use client';

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createExamWithActivityMutationOptions, updateExamSettingsMutationOptions } from './mutations';
import {
  examActivityQueryOptions,
  examAllAttemptsQueryOptions,
  examConfigQueryOptions,
  examDetailQueryOptions,
  examMyAttemptsQueryOptions,
  examQuestionsQueryOptions,
} from './queries';

function examActivityHookOptions(activityUuid: string | null | undefined) {
  const normalizedActivityUuid = activityUuid ?? '';

  return queryOptions({
    ...examActivityQueryOptions(normalizedActivityUuid),
    enabled: Boolean(activityUuid),
  });
}

function examQuestionsHookOptions(examUuid: string | null | undefined) {
  const normalizedExamUuid = examUuid ?? '';

  return queryOptions({
    ...examQuestionsQueryOptions(normalizedExamUuid),
    enabled: Boolean(examUuid),
  });
}

function examDetailHookOptions(examUuid: string | null | undefined) {
  const normalizedExamUuid = examUuid ?? '';

  return queryOptions({
    ...examDetailQueryOptions(normalizedExamUuid),
    enabled: Boolean(examUuid),
  });
}

function examMyAttemptsHookOptions(examUuid: string | null | undefined) {
  const normalizedExamUuid = examUuid ?? '';

  return queryOptions({
    ...examMyAttemptsQueryOptions(normalizedExamUuid),
    enabled: Boolean(examUuid),
  });
}

function examAllAttemptsHookOptions(examUuid: string | null | undefined, enabled = true) {
  const normalizedExamUuid = examUuid ?? '';

  return queryOptions({
    ...examAllAttemptsQueryOptions(normalizedExamUuid),
    enabled: Boolean(examUuid) && enabled,
  });
}

export function useExamActivity(activityUuid: string | null | undefined) {
  return useQuery(examActivityHookOptions(activityUuid));
}

export function useExamQuestions(examUuid: string | null | undefined) {
  return useQuery(examQuestionsHookOptions(examUuid));
}

export function useExamDetail(examUuid: string | null | undefined) {
  return useQuery(examDetailHookOptions(examUuid));
}

export function useExamMyAttempts(examUuid: string | null | undefined) {
  return useQuery(examMyAttemptsHookOptions(examUuid));
}

export function useExamAllAttempts(examUuid: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery(examAllAttemptsHookOptions(examUuid, options?.enabled ?? true));
}

export function useExamConfig() {
  return useQuery(examConfigQueryOptions());
}

export function useUpdateExamSettings(examUuid: string) {
  const queryClient = useQueryClient();
  return useMutation(updateExamSettingsMutationOptions(examUuid, queryClient));
}

export function useCreateExamWithActivity(
  courseUuid?: string | null,
  options?: { withUnpublishedActivities?: boolean },
) {
  const queryClient = useQueryClient();

  return useMutation(
    createExamWithActivityMutationOptions(queryClient, courseUuid, options?.withUnpublishedActivities ?? false),
  );
}
