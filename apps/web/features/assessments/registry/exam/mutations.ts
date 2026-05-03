'use client';

import { apiFetch } from '@/lib/api-client';
import { courseKeys } from '@/hooks/courses/courseKeys';
import { mutationOptions } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';

async function updateExamSettingsRequest(examUuid: string, settings: Record<string, unknown>) {
  const response = await apiFetch(`assessments/${examUuid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      policy: {
        time_limit_seconds: typeof settings.time_limit === 'number' ? Math.max(0, settings.time_limit) * 60 : null,
        anti_cheat_json: {
          copy_paste_protection: settings.copy_paste_protection,
          tab_switch_detection: settings.tab_switch_detection,
          devtools_detection: settings.devtools_detection,
          right_click_disable: settings.right_click_disable,
          fullscreen_enforcement: settings.fullscreen_enforcement,
          violation_threshold: settings.violation_threshold,
        },
        settings_json: settings,
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
        max_attempts: typeof input.settings.attempt_limit === 'number' ? input.settings.attempt_limit : 1,
        time_limit_seconds: typeof input.settings.time_limit === 'number' ? input.settings.time_limit * 60 : null,
        anti_cheat_json: {
          copy_paste_protection: input.settings.copy_paste_protection,
          tab_switch_detection: input.settings.tab_switch_detection,
          devtools_detection: input.settings.devtools_detection,
          right_click_disable: input.settings.right_click_disable,
          fullscreen_enforcement: input.settings.fullscreen_enforcement,
          violation_threshold: input.settings.violation_threshold,
        },
        settings_json: input.settings,
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
