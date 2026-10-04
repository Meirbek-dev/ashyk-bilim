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
  overviewOptions,
  savedViewsOptions,
} from './queries'

// Route loaders: each tab ensures what its screen reads with useSuspenseQuery (spec 7.3), from the full search.

type Search<T extends v.GenericSchema> = Filters & v.InferOutput<T>

/**
 * A group in the URL the caller cannot read (deleted, or a link from someone else) would fail every read with 422 or
 * 403 (BUG-121): the layout reads the group once (`getGroup`) and drops it on 403, 404 or 422.
 */
export async function hasUnknownCohort(queryClient: QueryClient, filters: Filters): Promise<boolean> {
  if (!filters.cohort) return false
  try {
    await queryClient.ensureQueryData(getGroupOptions({ path: { group_id: filters.cohort } }))
    return false
  } catch (error) {
    if (error instanceof ApiError && [403, 404, 422].includes(error.status)) return true
    throw error
  }
}

/** The layout: the overview answer carries the filter choices (courses, groups); the saved views. */
export const loadAnalytics = (queryClient: QueryClient, filters: Filters) =>
  Promise.all([queryClient.ensureQueryData(overviewOptions(filters)), queryClient.ensureQueryData(savedViewsOptions())])

/** overview and operations: the KPI answer and, when open, the rows behind one tile. */
export function loadMetricTab(queryClient: QueryClient, search: Search<typeof metricSearchSchema>) {
  const filters = pickFilters(search)
  return Promise.all([
    queryClient.ensureQueryData(overviewOptions(filters)),
    search.metric ? queryClient.ensureQueryData(drillOptions(filters, search.metric, search.page)) : null,
  ])
}

export function loadLearners(queryClient: QueryClient, search: Search<typeof learnersSearchSchema>) {
  const filters = pickFilters(search)
  const { learnerId, courseId } = search
  return Promise.all([
    queryClient.ensureQueryData(overviewOptions(filters)),
    queryClient.ensureQueryData(atRiskOptions(filters, search)),
    learnerId && courseId ? queryClient.ensureQueryData(interventionsOptions(learnerId, courseId)) : null,
  ])
}

/** performance: one assessment, one course, or both lists. A drill-down outside the scope is "not found". */
export async function loadPerformance(queryClient: QueryClient, search: Search<typeof performanceSearchSchema>) {
  const filters = pickFilters(search)
  const { assessmentType, assessmentId, courseId } = search
  if (assessmentType && assessmentId) {
    const assessment = { assessment_type: assessmentType, assessment_id: assessmentId }
    return Promise.all([
      ensureDrill(queryClient.ensureQueryData(assessmentOptions(filters, assessmentType, assessmentId))),
      ensureDrill(queryClient.ensureQueryData(drillOptions(filters, 'pass_rate', search.page, assessment))),
    ])
  }
  if (courseId) return ensureDrill(queryClient.ensureQueryData(courseOptions(filters, courseId)))
  return Promise.all([
    queryClient.ensureQueryData(coursesOptions(filters, search.coursePage)),
    queryClient.ensureQueryData(assessmentsOptions(filters, search.page)),
  ])
}

export const loadAdminAnalytics = (queryClient: QueryClient) => queryClient.ensureQueryData(adminAnalyticsOptions())
