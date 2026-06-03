'use client'

import { mutationOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { createChapter, deleteChapter, updateChapter, updateCourseOrderStructure } from '@services/courses/chapters'
import type { ChapterCreateValues, ChapterUpdateValues, CourseOrderPayload } from '@/schemas/chapterSchemas'

export function createChapterMutationOptions(queryClient: QueryClient, structureKey: readonly unknown[]) {
  return mutationOptions({
    mutationFn: async ({ payload }: { payload: ChapterCreateValues }) => createChapter(payload),
    onMutate: async ({ payload }) => {
      const tempId = `temp_chapter_${Date.now()}`
      const optimisticChapter = {
        ...payload,
        id: tempId,
        chapter_uuid: tempId,
        activities: [],
      }

      await queryClient.cancelQueries({ queryKey: structureKey })
      const previousStructure = queryClient.getQueryData(structureKey)

      queryClient.setQueryData(structureKey, (current: AppTranslator) =>
        current
          ? {
              ...current,
              chapters: [...(current.chapters ?? []), optimisticChapter],
            }
          : current,
      )

      return { previousStructure, tempId }
    },
    onSuccess: (createdChapter: AppChapter, _variables: unknown, context: AppMutationContext | undefined) => {
      queryClient.setQueryData(structureKey, (current: AppTranslator) =>
        current
          ? {
              ...current,
              chapters: (current.chapters ?? []).map((chapter: AppChapter) =>
                chapter.chapter_uuid === context?.tempId ? createdChapter : chapter,
              ),
            }
          : current,
      )
    },
    onError: (_error: unknown, _variables: unknown, context: AppMutationContext | undefined) => {
      queryClient.setQueryData(structureKey, context?.previousStructure)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: structureKey })
    },
  })
}

export function updateChapterMutationOptions(queryClient: QueryClient, structureKey: readonly unknown[]) {
  return mutationOptions({
    mutationFn: async ({ chapterUuid, payload }: { chapterUuid: string; payload: ChapterUpdateValues }) =>
      updateChapter(chapterUuid, payload),
    onMutate: async ({ chapterUuid, payload }) => {
      await queryClient.cancelQueries({ queryKey: structureKey })
      const previousStructure = queryClient.getQueryData(structureKey)

      queryClient.setQueryData(structureKey, (current: AppTranslator) =>
        current
          ? {
              ...current,
              chapters: (current.chapters ?? []).map((chapter: AppChapter) =>
                chapter.chapter_uuid === chapterUuid ? Object.assign(chapter, payload) : chapter,
              ),
            }
          : current,
      )

      return { previousStructure }
    },
    onError: (_error: unknown, _variables: unknown, context: AppMutationContext | undefined) => {
      queryClient.setQueryData(structureKey, context?.previousStructure)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: structureKey })
    },
  })
}

export function deleteChapterMutationOptions(queryClient: QueryClient, structureKey: readonly unknown[]) {
  return mutationOptions({
    mutationFn: async (chapterUuid: string) => deleteChapter(chapterUuid),
    onMutate: async (chapterUuid: string) => {
      await queryClient.cancelQueries({ queryKey: structureKey })
      const previousStructure = queryClient.getQueryData(structureKey)

      queryClient.setQueryData(structureKey, (current: AppTranslator) =>
        current
          ? {
              ...current,
              chapters: (current.chapters ?? []).filter((chapter: AppChapter) => chapter.chapter_uuid !== chapterUuid),
            }
          : current,
      )

      return { previousStructure }
    },
    onError: (_error: unknown, _variables: unknown, context: AppMutationContext | undefined) => {
      queryClient.setQueryData(structureKey, context?.previousStructure)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: structureKey })
    },
  })
}

export function reorderStructureMutationOptions(
  courseUuid: string,
  queryClient: QueryClient,
  structureKey: readonly unknown[],
) {
  return mutationOptions({
    mutationFn: async ({ payload }: { nextStructure: AppCourse; payload: CourseOrderPayload }) =>
      updateCourseOrderStructure(courseUuid, payload),
    onMutate: async ({ nextStructure }: { nextStructure: AppCourse; payload: CourseOrderPayload }) => {
      await queryClient.cancelQueries({ queryKey: structureKey })
      const previousStructure = queryClient.getQueryData(structureKey)
      queryClient.setQueryData(structureKey, nextStructure)
      return { previousStructure }
    },
    onError: (_error: unknown, _variables: unknown, context: AppMutationContext | undefined) => {
      queryClient.setQueryData(structureKey, context?.previousStructure)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: structureKey })
    },
  })
}
