import type { QueryClient } from '@tanstack/react-query'
import * as v from 'valibot'

import { ApiError } from '#/shared/api/errors'
import { getGroupOptions } from '#/shared/api/gen/@tanstack/react-query.gen'

import {
  type Filters,
  learnersSearchSchema,
  metricSearchSchema,
  performanceSearchSchema,
  pickFilters,
} from './model/filters'
import {
  adminAnalyticsOptions,
  assessmentOptions,
  assessmentsOptions,
  atRiskOptions,
  courseOptions,
  coursesOptions,
  drillOptions,
  ensureDrill,
  interventionsOptions,
  loadLearnerRisk,
  overviewOptions,
  savedViewsOptions,
} from './queries'
import type { AdminAnalyticsSearch } from './route'

// Route loaders: each tab ensures what its screen reads with useSuspenseQuery (spec 7.3), from the full search.

type Search<T extends v.GenericSchema> = Filters & v.InferOutput<T>

/**
 * A group in the URL the caller cannot read (deleted, or a link from someone else) would fail every read with 422 or
 * 403 (BUG-121): the layout reads the group once (`getGroup`) and drops it on 403, 404 or 422.
 */
export async function hasUnknownCohort(queryClient: QueryClient, filters: Filters): Promise<boolean> {
  if (!filters.cohort) return false
  try {
    await queryClient.query({ ...getGroupOptions({ path: { group_id: filters.cohort } }), staleTime: 'static' })
    return false
  } catch (error) {
    if (error instanceof ApiError && [403, 404, 422].includes(error.status)) return true
    throw error
  }
}

/** The layout: the overview answer carries the filter choices (courses, groups); the saved views. */
export const loadAnalytics = (queryClient: QueryClient, filters: Filters) =>
  Promise.all([
    queryClient.query({ ...overviewOptions(filters), staleTime: 'static' }),
    queryClient.query({ ...savedViewsOptions(), staleTime: 'static' }),
  ])

/** overview and operations: the KPI answer and, when open, the rows behind one tile. */
export function loadMetricTab(queryClient: QueryClient, search: Search<typeof metricSearchSchema>) {
  const filters = pickFilters(search)
  return Promise.all([
    queryClient.query({ ...overviewOptions(filters), staleTime: 'static' }),
    search.metric
      ? queryClient.query({ ...drillOptions(filters, search.metric, search.page), staleTime: 'static' })
      : null,
  ])
}

export function loadLearners(queryClient: QueryClient, search: Search<typeof learnersSearchSchema>) {
  const filters = pickFilters(search)
  const { learnerId, courseId } = search
  return Promise.all([
    queryClient.query({ ...overviewOptions(filters), staleTime: 'static' }),
    queryClient.query({ ...atRiskOptions(filters, search), staleTime: 'static' }).then(async data => {
      if (learnerId && courseId && !data.items.some(row => row.user_id === learnerId && row.course_id === courseId))
        await loadLearnerRisk(queryClient, filters, learnerId, courseId)
      return data
    }),
    learnerId && courseId
      ? queryClient.query({ ...interventionsOptions(learnerId, courseId), staleTime: 'static' })
      : null,
  ])
}

/** performance: one assessment, one course, or both lists. A drill-down outside the scope is "not found". */
export async function loadPerformance(queryClient: QueryClient, search: Search<typeof performanceSearchSchema>) {
  const filters = pickFilters(search)
  const { assessmentType, assessmentId, courseId } = search
  if (assessmentType && assessmentId) {
    const assessment = { assessment_type: assessmentType, assessment_id: assessmentId }
    return Promise.all([
      ensureDrill(
        queryClient.query({ ...assessmentOptions(filters, assessmentType, assessmentId), staleTime: 'static' }),
      ),
      ensureDrill(
        queryClient.query({ ...drillOptions(filters, 'pass_rate', search.page, assessment), staleTime: 'static' }),
      ),
    ])
  }
  if (courseId) return ensureDrill(queryClient.query({ ...courseOptions(filters, courseId), staleTime: 'static' }))
  return Promise.all([
    queryClient.query({
      ...coursesOptions(filters, search.coursePage, { sort: search.courseSort, desc: search.courseDesc }),
      staleTime: 'static',
    }),
    queryClient.query({
      ...assessmentsOptions(filters, search.page, { sort: search.sort, desc: search.desc }),
      staleTime: 'static',
    }),
  ])
}

/** The rankings in scope, and the unscoped ones whose courses and groups the filter menus offer. */
export const loadAdminAnalytics = (queryClient: QueryClient, search: AdminAnalyticsSearch) =>
  Promise.all([
    queryClient.query({ ...adminAnalyticsOptions(search.window, search), staleTime: 'static' }),
    queryClient.query({ ...adminAnalyticsOptions(search.window), staleTime: 'static' }),
  ])
