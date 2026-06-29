'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'
import { courseUpdatesQueryOptions } from '../queries/course.query'

function courseUpdatesHookOptions(courseUuid: string | null | undefined, enabled = true) {
  const normalizedCourseUuid = courseUuid ?? ''

  return queryOptions({
    ...courseUpdatesQueryOptions(normalizedCourseUuid),
    enabled: enabled && Boolean(courseUuid),
  })
}

export function useCourseUpdates(courseUuid: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery(courseUpdatesHookOptions(courseUuid, options?.enabled ?? true))
}
