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
  updateInterventionMutation,
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

import { pageCount } from './model/analytics'
import { apiQuery, type Filters } from './model/filters'

type Table = Parameters<typeof apiQuery>[1]

/** The KPI tiles, trends, risk counts and grading workload: shared by overview, learners and operations. */
export const overviewOptions = (filters: Filters) => teacherOverviewOptions({ query: apiQuery(filters) })

export const atRiskOptions = (filters: Filters, table: Table) =>
  atRiskLearnersOptions({ query: apiQuery(filters, table) })

/** A forwarded learner link is independent of the table's current page and course filter. */
export const learnerRiskOptions = (filters: Filters, courseId: CourseId, page: number) =>
  atRiskLearnersOptions({ query: { ...apiQuery({ ...filters, course: courseId }, { page }), page_size: 200 } })

export async function loadLearnerRisk(queryClient: QueryClient, filters: Filters, userId: UserId, courseId: CourseId) {
  for (let page = 1; ; page++) {
    const data = await queryClient.ensureQueryData(learnerRiskOptions(filters, courseId, page))
    const row = data.items.find(item => item.user_id === userId && item.course_id === courseId)
    if (row || data.items.length === 0 || page >= pageCount(data.total, data.page_size)) return row
  }
}

type Order = { sort?: string | undefined; desc?: boolean | undefined }

export const coursesOptions = (filters: Filters, page: number, order: Order = {}) =>
  courseListOptions({ query: apiQuery(filters, { page, ...order }) })

export const assessmentsOptions = (filters: Filters, page: number, order: Order = {}) =>
  assessmentListOptions({ query: apiQuery(filters, { page, ...order }) })

export const courseOptions = (filters: Filters, id: CourseId) =>
  courseDetailOptions({ path: { course_id: id }, query: apiQuery(filters) })

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

/**
 * The answer replaces the row in the learner's cached history. The at-risk rows and the overview count interventions
 * and show the latest one's type, which a change of status or outcome leaves as they are: no reload.
 */
export const updateInterventionOptions = (queryClient: QueryClient, userId: UserId, courseId: CourseId) => ({
  ...updateInterventionMutation(),
  onSuccess: (updated: Intervention) =>
    queryClient.setQueryData(interventionsOptions(userId, courseId).queryKey, (list: InterventionList | undefined) =>
      list ? { ...list, items: list.items.map(item => (item.id === updated.id ? updated : item)) } : list,
    ),
})

/** `If-Match` of an intervention: its version in the cached history (a retry after a 412 reads it first). */
export const interventionVersion = (queryClient: QueryClient, item: Intervention) =>
  queryClient
    .getQueryData(interventionsOptions(item.user_id, item.course_id).queryKey)
    ?.items.find(row => row.id === item.id)?.version ?? item.version

/** A retry after a 412 reads the history again: the row's current `version`. */
export const reloadInterventions = (queryClient: QueryClient, userId: UserId, courseId: CourseId) =>
  queryClient.fetchQuery({ ...interventionsOptions(userId, courseId), staleTime: 0 })

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
