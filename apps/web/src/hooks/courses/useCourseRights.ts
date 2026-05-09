'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';
import { courseKeys } from './courseKeys';
import { courseRightsQueryOptions } from '@/features/courses/queries/course.query';

function courseRightsHookOptions<TRights = unknown>(courseUuid: string) {
  return queryOptions({
    ...courseRightsQueryOptions<TRights>(courseUuid),
    enabled: Boolean(courseUuid),
  });
}

export function useCourseRights<TRights = any>(courseUuid: string) {
  const key = courseKeys.rights(courseUuid);

  const query = useQuery(courseRightsHookOptions<TRights>(courseUuid));

  return {
    data: query.data,
    error: query.error,
    fetchStatus: query.fetchStatus,
    isError: query.isError,
    isFetching: query.isFetching,
    isPending: query.isPending,
    isSuccess: query.isSuccess,
    mutate: query.refetch,
    refetch: query.refetch,
    rights: query.data,
    isLoading: query.isPending,
    key,
    status: query.status,
  };
}
