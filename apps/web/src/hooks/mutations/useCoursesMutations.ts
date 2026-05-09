'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CourseGeneralValues, CourseAccessValues } from '@/schemas/courseSchemas';
import { courseKeys } from '@/hooks/courses/courseKeys';
import {
  addCourseContributorsMutationOptions,
  removeCourseContributorsMutationOptions,
  updateCourseAccessMutationOptions,
  updateCourseContributorMutationOptions,
  updateCourseMetadataMutationOptions,
  updateCourseThumbnailMutationOptions,
} from '@/features/courses/mutations/course.mutation';

interface MutationOptions {
  lastKnownUpdateDate?: string | null;
}

interface ContributorDraftUser {
  id: number;
  username: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  email?: string;
  avatar_image?: string;
  user_uuid?: string;
}

interface ContributorMutationPayload {
  authorship?: string;
  authorship_status?: string;
}

export function useCoursesMutations(courseUuid: string, withUnpublishedActivities = true) {
  const queryClient = useQueryClient();
  const structureKey = courseKeys.structure(courseUuid, withUnpublishedActivities);
  const detailKey = courseKeys.detail(courseUuid);

  const refreshCourse = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: structureKey }),
      queryClient.invalidateQueries({ queryKey: detailKey }),
    ]);
  };

  const updateMetadataMutation = useMutation(
    updateCourseMetadataMutationOptions(courseUuid, queryClient, structureKey, detailKey),
  );
  const updateAccessMutation = useMutation(
    updateCourseAccessMutationOptions(courseUuid, queryClient, structureKey, detailKey),
  );
  const updateThumbnailMutation = useMutation(
    updateCourseThumbnailMutationOptions(courseUuid, queryClient, structureKey, detailKey),
  );
  const addContributorsMutation = useMutation(addCourseContributorsMutationOptions(courseUuid, queryClient));
  const updateContributorMutation = useMutation(updateCourseContributorMutationOptions(courseUuid, queryClient));
  const removeContributorsMutation = useMutation(removeCourseContributorsMutationOptions(courseUuid, queryClient));

  return {
    addContributors: async (usernames: string[], users: ContributorDraftUser[], options: MutationOptions) =>
      addContributorsMutation.mutateAsync({ options, usernames, users }),
    refreshCourse,
    removeContributors: async (usernames: string[], userIds: number[], options: MutationOptions) =>
      removeContributorsMutation.mutateAsync({ options, userIds, usernames }),
    updateContributor: async (
      contributorUserId: number,
      payload: ContributorMutationPayload,
      options: MutationOptions,
    ) => updateContributorMutation.mutateAsync({ contributorUserId, options, payload }),
    updateAccess: async (
      payload: Partial<CourseAccessValues & { open_to_contributors?: boolean }>,
      options: MutationOptions,
    ) => updateAccessMutation.mutateAsync({ options, payload }),
    updateMetadata: async (payload: Partial<CourseGeneralValues>, options: MutationOptions) =>
      updateMetadataMutation.mutateAsync({ options, payload }),
    updateThumbnail: async (formData: FormData, options: MutationOptions) =>
      updateThumbnailMutation.mutateAsync({ formData, options }),
  };
}
