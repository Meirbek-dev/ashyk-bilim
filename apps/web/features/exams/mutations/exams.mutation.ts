'use client';

import { apiFetch } from '@/lib/api-client';
import { courseKeys } from '@/hooks/courses/courseKeys';
import { mutationOptions, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';

async function updateExamSettingsRequest(examUuid: string, settings: Record<string, unknown>) {
  const response = await apiFetch(`exams/${examUuid}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to update exam settings');
  }

  return response.json();
}

export interface CreateExamWithActivityInput {
  activityName: string;
  chapterId: number;
  examTitle: string;
  examDescription: string;
  settings: Record<string, unknown>;
}

export interface CreateExamWithActivityResponse {
  activity_uuid?: string;
  exam_uuid?: string;
  [key: string]: unknown;
}

async function createExamWithActivityRequest(
  input: CreateExamWithActivityInput,
): Promise<CreateExamWithActivityResponse> {
  const response = await apiFetch('exams/with-activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      activity_name: input.activityName,
      chapter_id: input.chapterId,
      exam_title: input.examTitle,
      exam_description: input.examDescription,
      settings: input.settings,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as { detail?: string } & CreateExamWithActivityResponse;

  if (!response.ok) {
    throw new Error(payload.detail || 'Failed to create exam');
  }

  return payload;
}

export function updateExamSettingsMutationOptions(examUuid: string, queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: (settings: Record<string, unknown>) => updateExamSettingsRequest(examUuid, settings),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.exams.detail(examUuid) });
    },
  });
}

export function createExamWithActivityMutationOptions(
  queryClient: QueryClient,
  courseUuid?: string | null,
  withUnpublishedActivities = false,
) {
  return mutationOptions({
    mutationFn: (input: CreateExamWithActivityInput) => createExamWithActivityRequest(input),
    onSuccess: async () => {
      if (!courseUuid) return;

      await queryClient.invalidateQueries({
        queryKey: courseKeys.structure(courseUuid, withUnpublishedActivities),
      });
    },
  });
}
