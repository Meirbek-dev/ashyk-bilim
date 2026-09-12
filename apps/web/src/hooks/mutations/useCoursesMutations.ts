'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CourseAccessValues, CourseGeneralValues } from '@/schemas/courseSchemas'
import { courseKeys } from '@/hooks/courses/courseKeys'
import {
  updateCourseAccessMutationOptions,
  updateCourseMetadataMutationOptions,
  updateCourseThumbnailMutationOptions,
} from '@/features/courses/mutations/course.mutation'

interface MutationOptions {
  lastKnownUpdateDate?: string | null | undefined
}

export function useCoursesMutations(courseUuid: string, withUnpublishedActivities = true) {
  const queryClient = useQueryClient()
  const structureKey = courseKeys.structure(courseUuid, withUnpublishedActivities)
  const detailKey = courseKeys.detail(courseUuid)

  const refreshCourse = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: structureKey }),
      queryClient.invalidateQueries({ queryKey: detailKey }),
    ])
  }

  const updateMetadataMutation = useMutation(
    updateCourseMetadataMutationOptions(courseUuid, queryClient, structureKey, detailKey),
  )
  const updateAccessMutation = useMutation(
    updateCourseAccessMutationOptions(courseUuid, queryClient, structureKey, detailKey),
  )
  const updateThumbnailMutation = useMutation(
    updateCourseThumbnailMutationOptions(courseUuid, queryClient, structureKey, detailKey),
  )

  return {
    refreshCourse,
    updateAccess: async (
      payload: Partial<CourseAccessValues & { open_to_contributors?: boolean }>,
      options: MutationOptions,
    ) => updateAccessMutation.mutateAsync({ options, payload }),
    updateMetadata: async (payload: Partial<CourseGeneralValues>, options: MutationOptions) =>
      updateMetadataMutation.mutateAsync({ options, payload }),
    updateThumbnail: async (file: File) => updateThumbnailMutation.mutateAsync({ file }),
  }
}
