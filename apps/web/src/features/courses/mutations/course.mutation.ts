'use client'

import { mutationOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  updateCourseAccess,
  updateCourseLifecycle,
  updateCourseMetadata,
  updateCourseThumbnail,
} from '@services/courses/course-writes'
import type { CourseAccessValues, CourseGeneralValues } from '@/schemas/courseSchemas'
import { useCourseEditorStore } from '@/stores/courses'
import { uploadFile } from '@services/media/uploads'

interface MutationOptions {
  lastKnownUpdateDate?: string | null | undefined
  version?: number | undefined
}

const buildMutationOptions = (lastKnownUpdateDate: string | null | undefined, version?: number): MutationOptions => ({
  ...(lastKnownUpdateDate !== undefined ? { lastKnownUpdateDate } : {}),
  ...(version !== undefined ? { version } : {}),
})

export function updateCourseMetadataMutationOptions(
  courseUuid: string,
  queryClient: QueryClient,
  structureKey: readonly unknown[],
  detailKey: readonly unknown[],
) {
  return mutationOptions({
    // QA-D: the version the cache holds when the save runs (`If-Match`): a stale page answers 412, and a
    // retry after a refresh carries the fresh one.
    mutationFn: async ({ options, payload }: { options: MutationOptions; payload: Partial<CourseGeneralValues> }) =>
      updateCourseMetadata(
        courseUuid,
        payload,
        buildMutationOptions(
          options.lastKnownUpdateDate,
          options.version ?? queryClient.getQueryData<{ version?: number }>(structureKey)?.version,
        ),
      ),
    onMutate: async ({ payload }) => {
      await queryClient.cancelQueries({ queryKey: structureKey })
      const previousStructure = queryClient.getQueryData<AppCourse>(structureKey)
      queryClient.setQueryData(structureKey, (current: AppCourse | undefined) =>
        current ? { ...current, ...payload } : current,
      )
      return { previousStructure }
    },
    onError: (_error: unknown, _variables: unknown, context: AppMutationContext | undefined) => {
      queryClient.setQueryData(structureKey, context?.previousStructure)
    },
    onSuccess: async (response: Awaited<ReturnType<typeof updateCourseMetadata>>) => {
      useCourseEditorStore.getState().syncLastKnownUpdateDate(response?.data?.update_date)
      // The next save (before the refetch lands) must carry the version this one produced.
      const version = response?.data?.version
      if (typeof version === 'number')
        queryClient.setQueryData(structureKey, (current: AppCourse | undefined) =>
          current ? { ...current, version } : current,
        )
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: structureKey }),
        queryClient.invalidateQueries({ queryKey: detailKey }),
      ])
    },
  })
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
      options: MutationOptions
      payload: Partial<CourseAccessValues & { open_to_contributors?: boolean }>
    }) =>
      typeof payload.public === 'boolean'
        ? updateCourseLifecycle(courseUuid, payload.public, buildMutationOptions(options.lastKnownUpdateDate))
        : updateCourseAccess(courseUuid, payload, buildMutationOptions(options.lastKnownUpdateDate)),
    onMutate: async ({ payload }) => {
      await queryClient.cancelQueries({ queryKey: structureKey })
      const previousStructure = queryClient.getQueryData<AppCourse>(structureKey)
      queryClient.setQueryData(structureKey, (current: AppCourse | undefined) =>
        current ? { ...current, ...payload } : current,
      )
      return { previousStructure }
    },
    onError: (_error: unknown, _variables: unknown, context: AppMutationContext | undefined) => {
      queryClient.setQueryData(structureKey, context?.previousStructure)
    },
    onSuccess: async (response: Awaited<ReturnType<typeof updateCourseAccess>>) => {
      useCourseEditorStore.getState().syncLastKnownUpdateDate(response?.data?.update_date)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: structureKey }),
        queryClient.invalidateQueries({ queryKey: detailKey }),
      ])
    },
  })
}

export function updateCourseThumbnailMutationOptions(
  courseUuid: string,
  queryClient: QueryClient,
  structureKey: readonly unknown[],
  detailKey: readonly unknown[],
) {
  return mutationOptions({
    // Presigned PUT → finalize, then the course claims the finalized upload;
    // `null` removes the current one.
    mutationFn: async ({ file }: { file: File | null }) =>
      updateCourseThumbnail(courseUuid, file ? (await uploadFile(file, 'course-thumbnail')).id : null),
    onSuccess: async (response: Awaited<ReturnType<typeof updateCourseThumbnail>>) => {
      useCourseEditorStore.getState().syncLastKnownUpdateDate(response?.data?.update_date)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: structureKey }),
        queryClient.invalidateQueries({ queryKey: detailKey }),
      ])
    },
  })
}
