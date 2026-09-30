'use client'

import { useQuery } from '@tanstack/react-query'
import type { CourseListKeyOptions } from './courseKeys'
import { courseListQueryOptions } from '@/features/courses/queries/course.query'

export function useCourseList<TCourse = AppCourse>(options: CourseListKeyOptions = {}) {
  const query = useQuery(courseListQueryOptions<TCourse>(options))

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
  }
}
