import type { QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

import { ApiError } from '#/shared/api/errors'
import {
  adminOverviewOptions,
  assessmentDetailOptions,
  assessmentListOptions,
  atRiskLearnersOptions,
  atRiskLearnersQueryKey,
  courseDetailOptions,
  courseListOptions,
  createInterventionMutation,
  deleteViewMutation,
  drillThroughOptions,
  listInterventionsOptions,
  listSavedViewsOptions,
  saveViewMutation,
  teacherOverviewOptions,
  teacherOverviewQueryKey,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import type { Options } from '#/shared/api/gen/sdk.gen'
import type {
  AssessmentKind,
  CourseId,
  DeleteViewData,
  DrillMetric,
  Intervention,
  InterventionList,
  SavedView,
  SavedViewList,
  UserId,
} from '#/shared/api/gen/types.gen'
import { PLATFORM_TIME_ZONE } from '#/shared/i18n/format'

import { apiQuery, type Filters } from './model/filters'

type Table = Parameters<typeof apiQuery>[1]

/** The KPI tiles, trends, risk counts and grading workload: shared by overview, learners and operations. */
export const overviewOptions = (filters: Filters) => teacherOverviewOptions({ query: apiQuery(filters) })

export const atRiskOptions = (filters: Filters, table: Table) =>
  atRiskLearnersOptions({ query: apiQuery(filters, table) })

export const coursesOptions = (filters: Filters, page: number) =>
  courseListOptions({ query: apiQuery(filters, { page }) })

export const assessmentsOptions = (filters: Filters, page: number) =>
  assessmentListOptions({ query: apiQuery(filters, { page }) })

export const courseOptions = (filters: Filters, id: CourseId) =>
  courseDetailOptions({ path: { id }, query: apiQuery(filters) })

export const assessmentOptions = (filters: Filters, type: AssessmentKind, id: string) =>
  assessmentDetailOptions({ path: { assessment_type: type, assessment_id: id }, query: apiQuery(filters) })

type Drill = { assessment_type: AssessmentKind; assessment_id: string }

/** The rows behind a KPI (or an assessment's pass rate), one numbered page at a time. */
export const drillOptions = (filters: Filters, metric: DrillMetric, page: number, assessment?: Drill) =>
  drillThroughOptions({ path: { metric }, query: { ...apiQuery(filters, { page }), ...assessment } })

// "newest first, up to 100": one page is the whole history of a learner in a course.
const interventionsQuery = (user_id: UserId, course_id: CourseId) => ({
  query: { user_id, course_id, timezone: PLATFORM_TIME_ZONE, page_size: 100 },
})
export const interventionsOptions = (userId: UserId, courseId: CourseId) =>
  listInterventionsOptions(interventionsQuery(userId, courseId))

export const savedViewsOptions = () => listSavedViewsOptions()

export const adminAnalyticsOptions = () => adminOverviewOptions({ query: { timezone: PLATFORM_TIME_ZONE } })

/** A drill-down loader: an id outside the caller's scope (404) or malformed (422) is "not found" in the tab. */
export async function ensureDrill<T>(load: Promise<T>): Promise<T> {
  return load.catch((error: unknown) => {
    if (error instanceof ApiError && (error.status === 404 || error.status === 422)) throw notFound()
    throw error
  })
}

/**
 * The answer goes on top of the learner's cached history (no refetch); the at-risk rows and the overview carry
 * intervention counters, so they reload.
 */
export const createInterventionOptions = (queryClient: QueryClient, userId: UserId, courseId: CourseId) => ({
  ...createInterventionMutation(),
  onSuccess: (created: Intervention) =>
    queryClient.setQueryData(interventionsOptions(userId, courseId).queryKey, (list: InterventionList | undefined) =>
      list ? { ...list, items: [created, ...list.items], total: list.total + 1 } : list,
    ),
  meta: { invalidates: [atRiskLearnersQueryKey(), teacherOverviewQueryKey()] },
})

/** Saving overwrites the view of the same name and tab: the answer replaces it in the cached list or is added. */
export const saveViewOptions = (queryClient: QueryClient) => ({
  ...saveViewMutation(),
  onSuccess: (saved: SavedView) =>
    queryClient.setQueryData(savedViewsOptions().queryKey, (list: SavedViewList | undefined) => {
      if (!list) return list
      const others = list.items.filter(view => view.id !== saved.id)
      return { ...list, items: [...others, saved], total: others.length + 1 }
    }),
})

export const deleteViewOptions = (queryClient: QueryClient) => ({
  ...deleteViewMutation(),
  onSuccess: (_: unknown, { path }: Options<DeleteViewData>) =>
    queryClient.setQueryData(savedViewsOptions().queryKey, (list: SavedViewList | undefined) =>
      list ? { ...list, items: list.items.filter(view => view.id !== path.view_id), total: list.total - 1 } : list,
    ),
})
