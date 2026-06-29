'use client'

import { useCourseList as usePaginatedCourseList } from '@/hooks/courses/useCourseList'

export function useCourseList<TCourse = AppCourse>(page = 1, limit = 20) {
  return usePaginatedCourseList<TCourse>({ page, limit })
}
