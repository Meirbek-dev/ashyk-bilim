'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';
import { courseContributorsQueryOptions } from '@/features/courses/queries/course.query';

function courseContributorsHookOptions(courseUuid: string | null | undefined) {
  const normalizedCourseUuid = courseUuid ?? 'disabled';

  return queryOptions({
    ...courseContributorsQueryOptions(normalizedCourseUuid),
    enabled: Boolean(courseUuid),
  });
}

export function useCourseContributors(courseUuid: string | null | undefined) {
  return useQuery(courseContributorsHookOptions(courseUuid));
}
