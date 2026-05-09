'use client';

import { useQuery } from '@tanstack/react-query';
import type { CourseListKeyOptions } from './courseKeys';
import { courseListQueryOptions, editableCourseListQueryOptions } from '@/features/courses/queries/course.query';

export function useCourseList<TCourse = any>(options: CourseListKeyOptions = {}) {
  const query = useQuery(courseListQueryOptions<TCourse>(options));

  return {
    courses: query.data?.courses ?? [],
    data: query.data?.courses ?? [],
    error: query.error,
    fetchStatus: query.fetchStatus,
    isError: query.isError,
    isFetching: query.isFetching,
    isLoading: query.isPending,
    isPending: query.isPending,
    isSuccess: query.isSuccess,
    mutate: query.refetch,
    refetch: query.refetch,
    status: query.status,
    total: query.data?.total ?? 0,
  };
}

export function useEditableCourseList<TCourse = any>(options: CourseListKeyOptions = {}) {
  const query = useQuery(editableCourseListQueryOptions<TCourse>(options));

  return {
    courses: query.data?.courses ?? [],
    data: query.data?.courses ?? [],
    error: query.error,
    fetchStatus: query.fetchStatus,
    isError: query.isError,
    isFetching: query.isFetching,
    isLoading: query.isPending,
    isPending: query.isPending,
    isSuccess: query.isSuccess,
    mutate: query.refetch,
    refetch: query.refetch,
    summary: query.data?.summary,
    status: query.status,
    total: query.data?.total ?? 0,
  };
}
