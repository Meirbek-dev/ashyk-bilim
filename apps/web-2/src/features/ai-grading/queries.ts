import { queryOptions, type QueryClient } from '@tanstack/react-query'

import { ApiError } from '#/shared/api/errors'

import {
  activityGradeDraftsQueryKey,
  gradingConsistencyOptions,
  gradingMetricsOptions,
  gradingSettingsOptions,
  indexStatusOptions,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import { activityGradeDrafts } from '#/shared/api/gen/sdk.gen'
import type { ActivityId, CourseId } from '#/shared/api/gen/types.gen'

import type { AiGradingSearch } from './route'

// Reads and the route loaders of the «ИИ-проверка» tab and an activity's consistency page.

const byCourse = (courseId: CourseId) => ({ path: { course_id: courseId } })

export const settingsOptions = (courseId: CourseId) => gradingSettingsOptions(byCourse(courseId))
/** The period goes to the server only when chosen: the server's default is 30 days (B-AIG-02). */
export const metricsOptions = (courseId: CourseId, search: AiGradingSearch) =>
  gradingMetricsOptions({ ...byCourse(courseId), ...(search.days ? { query: { days: search.days } } : {}) })
export const indexOptions = (courseId: CourseId) => indexStatusOptions(byCourse(courseId))

export const consistencyOptions = (activityId: ActivityId) =>
  gradingConsistencyOptions({ path: { activity_id: activityId } })
/**
 * The drafts name the parts and criteria the report keys by (B-AIG-09). The key is the queue's (grading reads it too):
 * the same answer for the same key, no access (403, 404) is "no drafts" (null) there and here.
 */
export const draftsOptions = (activityId: ActivityId) =>
  queryOptions({
    queryKey: activityGradeDraftsQueryKey({ path: { activity_id: activityId } }),
    queryFn: async ({ signal }) =>
      activityGradeDrafts({ path: { activity_id: activityId }, signal, throwOnError: true }).then(
        response => response.data,
        (error: unknown) => {
          if (
            error instanceof ApiError &&
            (error.status === 403 || error.status === 404 || error.code === 'ai-disabled')
          )
            return null
          throw error
        },
      ),
  })

export const ensureAiGrading = (queryClient: QueryClient, courseId: CourseId, search: AiGradingSearch) =>
  Promise.all([
    queryClient.query({ ...settingsOptions(courseId), staleTime: 'static' }),
    queryClient.query({ ...metricsOptions(courseId, search), staleTime: 'static' }),
    queryClient.query({ ...indexOptions(courseId), staleTime: 'static' }),
  ])

export const ensureConsistency = (queryClient: QueryClient, activityId: ActivityId) =>
  Promise.all([
    queryClient.query({ ...consistencyOptions(activityId), staleTime: 'static' }),
    queryClient.query({ ...draftsOptions(activityId), staleTime: 'static' }),
  ])
