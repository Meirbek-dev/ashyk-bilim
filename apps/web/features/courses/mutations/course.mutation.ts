'use client';

import { mutationOptions } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import {
  bulkAddContributors,
  bulkRemoveContributors,
  editContributor,
  updateCourseAccess,
  updateCourseMetadata,
  updateCourseThumbnail,
} from '@services/courses/courses';
import type { CourseGeneralValues, CourseAccessValues } from '@/schemas/courseSchemas';
import type { CourseEditorBundle } from '@services/courses/editor';
import { courseKeys } from '@/hooks/courses/courseKeys';
import { assertSuccess } from '@/lib/api/assertSuccess';
import { useCourseEditorStore } from '@/stores/courses';

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

function buildOptimisticContributor(user: ContributorDraftUser) {
  const now = new Date().toISOString();
  return {
    id: `temp-${user.user_uuid ?? user.id}`,
    user_id: user.id,
    authorship: 'CONTRIBUTOR',
    authorship_status: 'PENDING',
    creation_date: now,
    update_date: now,
    user: {
      username: user.username,
      first_name: user.first_name ?? '',
      middle_name: user.middle_name ?? '',
      last_name: user.last_name ?? '',
      email: user.email ?? '',
      avatar_image: user.avatar_image ?? '',
      user_uuid: user.user_uuid ?? '',
    },
  };
}

export function updateCourseMetadataMutationOptions(
  courseUuid: string,
  queryClient: QueryClient,
  structureKey: readonly unknown[],
  detailKey: readonly unknown[],
) {
  return mutationOptions({
    mutationFn: async ({ options, payload }: { options: MutationOptions; payload: Partial<CourseGeneralValues> }) =>
      assertSuccess(
        await updateCourseMetadata(courseUuid, payload, {
          lastKnownUpdateDate: options.lastKnownUpdateDate,
        }),
      ),
    onMutate: async ({ payload }) => {
      await queryClient.cancelQueries({ queryKey: structureKey });
      const previousStructure = queryClient.getQueryData(structureKey);
      queryClient.setQueryData(structureKey, (current: any) => (current ? { ...current, ...payload } : current));
      return { previousStructure };
    },
    onError: (_error: unknown, _variables: any, context: any) => {
      queryClient.setQueryData(structureKey, context?.previousStructure);
    },
    onSuccess: async (response: any) => {
      useCourseEditorStore.getState().syncLastKnownUpdateDate(response?.data?.update_date);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: structureKey }),
        queryClient.invalidateQueries({ queryKey: detailKey }),
      ]);
    },
  });
}

export function updateCourseAccessMutationOptions(
  courseUuid: string,
  queryClient: QueryClient,
  structureKey: readonly unknown[],
  detailKey: readonly unknown[],
) {
  return mutationOptions({
    mutationFn: async ({
      options,
      payload,
    }: {
      options: MutationOptions;
      payload: Partial<CourseAccessValues & { open_to_contributors?: boolean }>;
    }) =>
      assertSuccess(
        await updateCourseAccess(courseUuid, payload, {
          lastKnownUpdateDate: options.lastKnownUpdateDate,
        }),
      ),
    onMutate: async ({ payload }) => {
      await queryClient.cancelQueries({ queryKey: structureKey });
      const previousStructure = queryClient.getQueryData(structureKey);
      queryClient.setQueryData(structureKey, (current: any) => (current ? { ...current, ...payload } : current));
      return { previousStructure };
    },
    onError: (_error: unknown, _variables: any, context: any) => {
      queryClient.setQueryData(structureKey, context?.previousStructure);
    },
    onSuccess: async (response: any) => {
      useCourseEditorStore.getState().syncLastKnownUpdateDate(response?.data?.update_date);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: structureKey }),
        queryClient.invalidateQueries({ queryKey: detailKey }),
      ]);
    },
  });
}

export function updateCourseThumbnailMutationOptions(
  courseUuid: string,
  queryClient: QueryClient,
  structureKey: readonly unknown[],
  detailKey: readonly unknown[],
) {
  return mutationOptions({
    mutationFn: async ({ formData, options }: { formData: FormData; options: MutationOptions }) =>
      assertSuccess(
        await updateCourseThumbnail(courseUuid, formData, {
          lastKnownUpdateDate: options.lastKnownUpdateDate,
        }),
      ),
    onSuccess: async (response: any) => {
      useCourseEditorStore.getState().syncLastKnownUpdateDate(response?.data?.update_date);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: structureKey }),
        queryClient.invalidateQueries({ queryKey: detailKey }),
      ]);
    },
  });
}

export function addCourseContributorsMutationOptions(courseUuid: string, queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: async ({
      usernames,
    }: {
      options: MutationOptions;
      usernames: string[];
      users: ContributorDraftUser[];
    }) => assertSuccess(await bulkAddContributors(courseUuid, usernames)),
    onMutate: async ({ users }: { users: ContributorDraftUser[]; usernames: string[]; options: MutationOptions }) => {
      const editorBundleKey = courseKeys.editorBundle(courseUuid);
      if (!editorBundleKey) {
        return { editorBundleKey: null, previousEditorBundle: undefined };
      }

      await queryClient.cancelQueries({ queryKey: editorBundleKey });
      const previousEditorBundle = queryClient.getQueryData(editorBundleKey);

      if (users.length > 0) {
        queryClient.setQueryData(editorBundleKey, (current: CourseEditorBundle | undefined) => {
          if (!current) return current;
          const existingContributors = current.contributors.data ?? [];
          const existingUsernames = new Set(existingContributors.map((contributor: any) => contributor.user?.username));
          const optimisticContributors = users
            .filter((user) => !existingUsernames.has(user.username))
            .map((user) => buildOptimisticContributor(user));

          return {
            ...current,
            contributors: {
              ...current.contributors,
              available: true,
              data: [...existingContributors, ...optimisticContributors],
              error: null,
            },
          };
        });
      }

      return { editorBundleKey, previousEditorBundle };
    },
    onError: (_error: unknown, _variables: any, context: any) => {
      if (context?.editorBundleKey) {
        queryClient.setQueryData(context.editorBundleKey, context.previousEditorBundle);
      }
    },
    onSuccess: async () => {
      const editorBundleKey = courseKeys.editorBundle(courseUuid);
      const detailKey = courseKeys.detail(courseUuid);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: detailKey }),
        ...(editorBundleKey ? [queryClient.invalidateQueries({ queryKey: editorBundleKey })] : []),
      ]);
    },
  });
}

export function updateCourseContributorMutationOptions(courseUuid: string, queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: async ({
      contributorUserId,
      payload,
    }: {
      contributorUserId: number;
      options: MutationOptions;
      payload: ContributorMutationPayload;
    }) =>
      assertSuccess(
        await editContributor(courseUuid, contributorUserId, payload.authorship, payload.authorship_status),
      ),
    onMutate: async ({
      contributorUserId,
      payload,
    }: {
      contributorUserId: number;
      options: MutationOptions;
      payload: ContributorMutationPayload;
    }) => {
      const editorBundleKey = courseKeys.editorBundle(courseUuid);
      if (!editorBundleKey) {
        return { editorBundleKey: null, previousEditorBundle: undefined };
      }

      await queryClient.cancelQueries({ queryKey: editorBundleKey });
      const previousEditorBundle = queryClient.getQueryData(editorBundleKey);

      queryClient.setQueryData(editorBundleKey, (current: CourseEditorBundle | undefined) => {
        if (!current) return current;
        return {
          ...current,
          contributors: {
            ...current.contributors,
            data: (current.contributors.data ?? []).map((contributor: any) =>
              contributor.user_id === contributorUserId ? Object.assign(contributor, payload) : contributor,
            ),
          },
        };
      });

      return { editorBundleKey, previousEditorBundle };
    },
    onError: (_error: unknown, _variables: any, context: any) => {
      if (context?.editorBundleKey) {
        queryClient.setQueryData(context.editorBundleKey, context.previousEditorBundle);
      }
    },
    onSuccess: async () => {
      const editorBundleKey = courseKeys.editorBundle(courseUuid);
      const detailKey = courseKeys.detail(courseUuid);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: detailKey }),
        ...(editorBundleKey ? [queryClient.invalidateQueries({ queryKey: editorBundleKey })] : []),
      ]);
    },
  });
}

export function removeCourseContributorsMutationOptions(courseUuid: string, queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: async ({ usernames }: { options: MutationOptions; userIds: number[]; usernames: string[] }) =>
      assertSuccess(await bulkRemoveContributors(courseUuid, usernames)),
    onMutate: async ({ userIds, usernames }: { options: MutationOptions; userIds: number[]; usernames: string[] }) => {
      const editorBundleKey = courseKeys.editorBundle(courseUuid);
      if (!editorBundleKey) {
        return { editorBundleKey: null, previousEditorBundle: undefined };
      }

      await queryClient.cancelQueries({ queryKey: editorBundleKey });
      const previousEditorBundle = queryClient.getQueryData(editorBundleKey);
      const usernameSet = new Set(usernames);
      const userIdSet = new Set(userIds);

      queryClient.setQueryData(editorBundleKey, (current: CourseEditorBundle | undefined) => {
        if (!current) return current;
        return {
          ...current,
          contributors: {
            ...current.contributors,
            data: (current.contributors.data ?? []).filter(
              (contributor: any) => !userIdSet.has(contributor.user_id) && !usernameSet.has(contributor.user?.username),
            ),
          },
        };
      });

      return { editorBundleKey, previousEditorBundle };
    },
    onError: (_error: unknown, _variables: any, context: any) => {
      if (context?.editorBundleKey) {
        queryClient.setQueryData(context.editorBundleKey, context.previousEditorBundle);
      }
    },
    onSuccess: async () => {
      const editorBundleKey = courseKeys.editorBundle(courseUuid);
      const detailKey = courseKeys.detail(courseUuid);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: detailKey }),
        ...(editorBundleKey ? [queryClient.invalidateQueries({ queryKey: editorBundleKey })] : []),
      ]);
    },
  });
}
