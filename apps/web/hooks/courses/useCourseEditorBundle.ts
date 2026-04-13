'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';
import { courseKeys } from './courseKeys';
import { courseEditorBundleQueryOptions } from '@/features/courses/queries/course.query';

function courseEditorBundleHookOptions(courseUuid?: string | null) {
  const normalizedCourseUuid = courseUuid ?? '';

  return queryOptions({
    ...courseEditorBundleQueryOptions(normalizedCourseUuid),
    enabled: Boolean(courseUuid),
  });
}

export function useCourseEditorBundle(courseUuid?: string | null) {
  const key = courseUuid ? courseKeys.editorBundle(courseUuid) : null;

  const query = useQuery(courseEditorBundleHookOptions(courseUuid));

  return {
    data: query.data,
    editorData: query.data,
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
