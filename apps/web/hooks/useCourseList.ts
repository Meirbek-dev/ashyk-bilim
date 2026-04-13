'use client';

import { useCourseList as usePaginatedCourseList } from '@/hooks/courses/useCourseList';

export function useCourseList(page = 1, limit = 20) {
  return usePaginatedCourseList({ page, limit });
}
