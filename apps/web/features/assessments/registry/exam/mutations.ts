'use client';

import { apiFetch } from '@/lib/api-client';
import { courseKeys } from '@/hooks/courses/courseKeys';
import { mutationOptions } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import {
  buildExamAntiCheatSettings,
  getExamAttemptLimit,
  getExamTimeLimitSeconds,
  normalizeExamPolicySettings,
} from './policySettings';

async function updateExamSettingsRequest(examUuid: string, settings: Record<string, unknown>) {
  const normalizedSettings = normalizeExamPolicySettings(settings);
  const response = await apiFetch(`assessments/${examUuid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      policy: {
        max_attempts: getExamAttemptLimit(normalizedSettings),
        time_limit_seconds: getExamTimeLimitSeconds(normalizedSettings),
        anti_cheat_json: buildExamAntiCheatSettings(normalizedSettings),
        settings_json: normalizedSettings,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to update exam settings');
  }

  return response.json();
}

export interface CreateExamWithActivityInput {
  activityName: string;
  courseId: number;
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
  const normalizedSettings = normalizeExamPolicySettings(input.settings);
  const response = await apiFetch('assessments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'EXAM',
      title: input.examTitle,
      description: input.examDescription,
      course_id: input.courseId,
      chapter_id: input.chapterId,
      grading_type: 'PERCENTAGE',
      policy: {
        max_attempts: getExamAttemptLimit(normalizedSettings) ?? 1,
        time_limit_seconds: getExamTimeLimitSeconds(normalizedSettings),
        anti_cheat_json: buildExamAntiCheatSettings(normalizedSettings),
        settings_json: normalizedSettings,
      },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    detail?: string;
    assessment_uuid?: string;
    activity_uuid?: string;
  };

  if (!response.ok) {
    throw new Error(payload.detail || 'Failed to create exam');
  }

  return {
    ...payload,
    exam_uuid: payload.assessment_uuid,
    activity_uuid: payload.activity_uuid,
  };
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
