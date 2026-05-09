'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ActivityCreateValues, ActivityUpdateValues } from '@/schemas/activitySchemas';
import { courseKeys } from '@/hooks/courses/courseKeys';
import {
  createActivityMutationOptions,
  createExternalVideoMutationOptions,
  createFileActivityMutationOptions,
  deleteActivityMutationOptions,
  updateActivityMutationOptions,
} from '@/features/courses/mutations/activity.mutation';

export function useActivityMutations(courseUuid: string, withUnpublishedActivities = true) {
  const queryClient = useQueryClient();
  const structureKey = courseKeys.structure(courseUuid, withUnpublishedActivities);

  const updateActivityMutation = useMutation(updateActivityMutationOptions(queryClient, structureKey));
  const deleteActivityMutation = useMutation(deleteActivityMutationOptions(queryClient, structureKey));
  const createActivityMutation = useMutation(createActivityMutationOptions(queryClient, structureKey));
  const createFileActivityMutation = useMutation(createFileActivityMutationOptions(queryClient, structureKey));
  const createExternalVideoMutation = useMutation(createExternalVideoMutationOptions(queryClient, structureKey));

  return {
    createActivity: async (payload: ActivityCreateValues, chapterId: number) =>
      createActivityMutation.mutateAsync({ chapterId, payload }),
    createExternalVideo: async (
      externalVideoData: Record<string, unknown>,
      activityPayload: Partial<ActivityCreateValues>,
      chapterId: number,
    ) => createExternalVideoMutation.mutateAsync({ activityPayload, chapterId, externalVideoData }),
    createFileActivity: async (
      file: File,
      type: string,
      payload: Partial<ActivityCreateValues>,
      chapterId: number,
      onProgress?: (progress: { percentage: number }) => void,
    ) => createFileActivityMutation.mutateAsync({ chapterId, file, onProgress, payload, type }),
    deleteActivity: async (activityUuid: string) => deleteActivityMutation.mutateAsync(activityUuid),
    updateActivity: async (activityUuid: string, payload: Partial<ActivityUpdateValues>) =>
      updateActivityMutation.mutateAsync({ activityUuid, payload }),
  };
}
