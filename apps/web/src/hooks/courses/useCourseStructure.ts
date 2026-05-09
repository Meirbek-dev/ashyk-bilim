'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';
import { courseKeys } from './courseKeys';
import { courseStructureQueryOptions } from '@/features/courses/queries/course.query';

interface UseCourseStructureOptions<TCourseStructure> {
  withUnpublishedActivities?: boolean;
  fallbackData?: TCourseStructure;
}

/**
 * Fetches the course structure (meta + chapters + activities).
 *
 * The auth token is NOT included in the query key. It is injected automatically
 * by the shared API client in root providers. This keeps
 * cache entries stable across token refreshes.
 */
function courseStructureHookOptions<TCourseStructure = unknown>(
  courseUuid: string,
  options?: UseCourseStructureOptions<TCourseStructure>,
) {
  const withUnpublishedActivities = options?.withUnpublishedActivities ?? false;

  return queryOptions({
    ...courseStructureQueryOptions<TCourseStructure>(courseUuid, withUnpublishedActivities),
    enabled: Boolean(courseUuid),
    initialData: options?.fallbackData,
  });
}

export function useCourseStructure<TCourseStructure = any>(
  courseUuid: string,
  options?: UseCourseStructureOptions<TCourseStructure>,
) {
  const withUnpublishedActivities = options?.withUnpublishedActivities ?? false;
  const key = courseKeys.structure(courseUuid, withUnpublishedActivities);

  const query = useQuery(courseStructureHookOptions<TCourseStructure>(courseUuid, options));

  return {
    courseStructure: query.data,
    data: query.data,
    error: query.error,
    fetchStatus: query.fetchStatus,
    isError: query.isError,
    isFetching: query.isFetching,
    isLoading: query.isPending,
    isPending: query.isPending,
    isSuccess: query.isSuccess,
    key,
    mutate: async () => (await query.refetch()).data,
    refetch: query.refetch,
    status: query.status,
  };
}

export function useCourseChapters<TChapter = any>(courseUuid: string, withUnpublishedActivities = false) {
  const { courseStructure, ...rest } = useCourseStructure<{ chapters?: TChapter[] }>(courseUuid, {
    withUnpublishedActivities,
  });

  return {
    ...rest,
    chapters: courseStructure?.chapters ?? [],
  };
}

export function useChapter<TChapter = any>(courseUuid: string, chapterUuid: string, withUnpublishedActivities = false) {
  const { courseStructure, ...rest } = useCourseStructure<{ chapters?: TChapter[] }>(courseUuid, {
    withUnpublishedActivities,
  });

  const chapter =
    courseStructure?.chapters?.find((currentChapter: any) => currentChapter.chapter_uuid === chapterUuid) ?? null;

  return { ...rest, chapter };
}

export function useChapterActivities<TActivity = any>(
  courseUuid: string,
  chapterUuid: string,
  enabled: boolean,
  withUnpublishedActivities = false,
) {
  const { chapter, ...rest } = useChapter<{ activities?: TActivity[] }>(
    courseUuid,
    chapterUuid,
    withUnpublishedActivities,
  );

  return {
    ...rest,
    activities: enabled ? (chapter?.activities ?? []) : [],
    isLoading: enabled ? rest.isLoading : false,
  };
}
