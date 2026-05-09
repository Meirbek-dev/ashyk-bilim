'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ChapterCreateValues, ChapterUpdateValues, CourseOrderPayload } from '@/schemas/chapterSchemas';
import { courseKeys } from '@/hooks/courses/courseKeys';
import {
  createChapterMutationOptions,
  deleteChapterMutationOptions,
  reorderStructureMutationOptions,
  updateChapterMutationOptions,
} from '@/features/courses/mutations/chapter.mutation';

export function useChapterMutations(courseUuid: string, withUnpublishedActivities = true) {
  const queryClient = useQueryClient();
  const structureKey = courseKeys.structure(courseUuid, withUnpublishedActivities);

  const createChapterMutation = useMutation(createChapterMutationOptions(queryClient, structureKey));
  const updateChapterMutation = useMutation(updateChapterMutationOptions(queryClient, structureKey));
  const deleteChapterMutation = useMutation(deleteChapterMutationOptions(queryClient, structureKey));
  const reorderStructureMutation = useMutation(reorderStructureMutationOptions(courseUuid, queryClient, structureKey));

  return {
    createChapter: async (payload: ChapterCreateValues) => createChapterMutation.mutateAsync({ payload }),
    deleteChapter: async (chapterUuid: string) => deleteChapterMutation.mutateAsync(chapterUuid),
    reorderStructure: async (nextStructure: any, payload: CourseOrderPayload) =>
      reorderStructureMutation.mutateAsync({ nextStructure, payload }),
    updateChapter: async (chapterUuid: string, payload: ChapterUpdateValues) =>
      updateChapterMutation.mutateAsync({ chapterUuid, payload }),
  };
}
