'use client';

import { mutationOptions } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import {
  createActivity,
  createExternalVideoActivity,
  deleteActivity,
  updateActivity,
} from '@services/courses/activities';
import { createFileActivity } from '@services/courses/activity-uploads';
import type { ActivityCreateValues, ActivityUpdateValues } from '@/schemas/activitySchemas';
import { courseKeys } from '@/hooks/courses/courseKeys';
import { assertSuccess } from '@/lib/api/assertSuccess';

export function updateActivityMutationOptions(queryClient: QueryClient, structureKey: readonly unknown[]) {
  return mutationOptions({
    mutationFn: async ({ activityUuid, payload }: { activityUuid: string; payload: Partial<ActivityUpdateValues> }) =>
      assertSuccess(await updateActivity(payload, activityUuid)),
    onMutate: async ({ activityUuid, payload }) => {
      const activityKey = courseKeys.activity(activityUuid);

      await Promise.all([
        queryClient.cancelQueries({ queryKey: structureKey }),
        queryClient.cancelQueries({ queryKey: activityKey }),
      ]);

      const previousStructure = queryClient.getQueryData(structureKey);
      const previousActivity = queryClient.getQueryData(activityKey);

      queryClient.setQueryData(structureKey, (current: any) =>
        current
          ? {
              ...current,
              chapters: (current.chapters ?? []).map((chapter: any) =>
                Object.assign(chapter, {
                  activities: (chapter.activities ?? []).map((activity: any) =>
                    activity.activity_uuid === activityUuid ? Object.assign(activity, payload) : activity,
                  ),
                }),
              ),
            }
          : current,
      );

      queryClient.setQueryData(activityKey, (current: any) => (current ? { ...current, ...payload } : current));

      return { activityKey, previousActivity, previousStructure };
    },
    onError: (_error: unknown, _variables: any, context: any) => {
      if (!context) return;
      queryClient.setQueryData(structureKey, context.previousStructure);
      queryClient.setQueryData(context.activityKey, context.previousActivity);
    },
    onSettled: async (
      _data: unknown,
      _error: unknown,
      variables: { activityUuid: string; payload: Partial<ActivityUpdateValues> },
    ) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: structureKey }),
        queryClient.invalidateQueries({ queryKey: courseKeys.activity(variables.activityUuid) }),
      ]);
    },
  });
}

export function deleteActivityMutationOptions(queryClient: QueryClient, structureKey: readonly unknown[]) {
  return mutationOptions({
    mutationFn: async (activityUuid: string) => assertSuccess(await deleteActivity(activityUuid)),
    onMutate: async (activityUuid: string) => {
      await queryClient.cancelQueries({ queryKey: structureKey });
      const previousStructure = queryClient.getQueryData(structureKey);

      queryClient.setQueryData(structureKey, (current: any) =>
        current
          ? {
              ...current,
              chapters: (current.chapters ?? []).map((chapter: any) =>
                Object.assign(chapter, {
                  activities: (chapter.activities ?? []).filter(
                    (activity: any) => activity.activity_uuid !== activityUuid,
                  ),
                }),
              ),
            }
          : current,
      );

      return { previousStructure };
    },
    onError: (_error: unknown, _variables: any, context: any) => {
      queryClient.setQueryData(structureKey, context?.previousStructure);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: structureKey });
    },
  });
}

export function createActivityMutationOptions(queryClient: QueryClient, structureKey: readonly unknown[]) {
  return mutationOptions({
    mutationFn: async ({ chapterId, payload }: { chapterId: number; payload: ActivityCreateValues }) =>
      assertSuccess(await createActivity(payload, chapterId)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: structureKey });
    },
  });
}

export function createFileActivityMutationOptions(queryClient: QueryClient, structureKey: readonly unknown[]) {
  return mutationOptions({
    mutationFn: async ({
      chapterId,
      file,
      onProgress,
      payload,
      type,
    }: {
      chapterId: number;
      file: File;
      onProgress?: (progress: { percentage: number }) => void;
      payload: Partial<ActivityCreateValues>;
      type: string;
    }) => createFileActivity(file, type, payload, chapterId, undefined, onProgress),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: structureKey });
    },
  });
}

export function createExternalVideoMutationOptions(queryClient: QueryClient, structureKey: readonly unknown[]) {
  return mutationOptions({
    mutationFn: async ({
      activityPayload,
      chapterId,
      externalVideoData,
    }: {
      activityPayload: Partial<ActivityCreateValues>;
      chapterId: number;
      externalVideoData: Record<string, unknown>;
    }) => assertSuccess(await createExternalVideoActivity(externalVideoData, activityPayload, chapterId)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: structureKey });
    },
  });
}
