'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';
import { courseKeys } from './courseKeys';
import { courseQueryOptions } from '@/features/courses/queries/course.query';

function courseHookOptions<TCourse = unknown>(courseUuid: string) {
  return queryOptions({
    ...courseQueryOptions<TCourse>(courseUuid),
    enabled: Boolean(courseUuid),
  });
}

export function useCourse<TCourse = any>(courseUuid: string) {
  const key = courseKeys.detail(courseUuid);

  const query = useQuery(courseHookOptions<TCourse>(courseUuid));

  return {
    course: query.data,
    data: query.data,
    error: query.error,
    fetchStatus: query.fetchStatus,
    isError: query.isError,
    isFetching: query.isFetching,
    isLoading: query.isPending,
    isPending: query.isPending,
    isSuccess: query.isSuccess,
    key,
    mutate: query.refetch,
    refetch: query.refetch,
    status: query.status,
  };
}
