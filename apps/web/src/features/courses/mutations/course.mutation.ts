'use client'

import { mutationOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  updateCourseAccess,
  updateCourseLifecycle,
  updateCourseMetadata,
  updateCourseThumbnail,
} from '@services/courses/courses'
import type { CourseAccessValues, CourseGeneralValues } from '@/schemas/courseSchemas'
import { useCourseEditorStore } from '@/stores/courses'
import { uploadFile } from '@services/media/uploads'

interface MutationOptions {
  lastKnownUpdateDate?: string | null | undefined
}

const buildMutationOptions = (lastKnownUpdateDate: string | null | undefined): MutationOptions =>
  lastKnownUpdateDate !== undefined ? { lastKnownUpdateDate } : {}

export function updateCourseMetadataMutationOptions(
  courseUuid: string,
  queryClient: QueryClient,
  structureKey: readonly unknown[],
  detailKey: readonly unknown[],
) {
  return mutationOptions({
    mutationFn: async ({ options, payload }: { options: MutationOptions; payload: Partial<CourseGeneralValues> }) =>
      updateCourseMetadata(courseUuid, payload, buildMutationOptions(options.lastKnownUpdateDate)),
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
    // Presigned PUT → finalize, then the course claims the finalized upload.
    mutationFn: async ({ file }: { file: File }) =>
      updateCourseThumbnail(courseUuid, (await uploadFile(file, 'course-thumbnail')).id),
    onSuccess: async (response: Awaited<ReturnType<typeof updateCourseThumbnail>>) => {
      useCourseEditorStore.getState().syncLastKnownUpdateDate(response?.data?.update_date)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: structureKey }),
        queryClient.invalidateQueries({ queryKey: detailKey }),
      ])
    },
  })
}
