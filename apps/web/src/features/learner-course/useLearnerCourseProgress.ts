'use client'

import { useQuery } from '@tanstack/react-query'

import { learnerCourseProgress, learnerCourseStateQueryOptions } from './api'

/**
 * Per-course N/M + % from `GET courses/{id}/learner-state` - the same source the
 * course page uses. Trail runs only carry lesson-type `steps` (UX, not progress).
 */
export function useLearnerCourseProgress(courseUuid: string, enabled = true) {
  const query = useQuery(learnerCourseStateQueryOptions(courseUuid, enabled))
  return {
    ...learnerCourseProgress(query.data),
    isLoaded: query.data !== undefined,
    nextAction: query.data?.next_action?.id ?? null,
    /** The course certifies at all (UX-252: no certification → no «недоступен»). */
    certificateConfigured: query.data?.certificate?.configured ?? false,
    certificateHref: query.data?.certificate?.issued ? (query.data.certificate.href ?? null) : null,
  }
}
