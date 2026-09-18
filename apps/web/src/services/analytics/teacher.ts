import type { AnalyticsQuery, AssessmentType, SavedAnalyticsViewCreate } from '@/types/analytics'
import { createIdempotencyKey } from '@/lib/api/headers'
import {
  TeacherOverviewResponse,
  AdminAnalyticsResponse,
  TeacherCourseListResponse,
  TeacherCourseDetailResponse,
  TeacherAssessmentListResponse,
  TeacherAssessmentDetailResponse,
  AtRiskLearnersResponse,
  DrillThroughResponse,
  SavedViewList,
  SavedView,
  SaveViewRequest,
  CreateInterventionRequest,
  Intervention,
  InterventionList,
  CourseId,
  AssessmentId,
  AssessmentKind,
} from '@/lib/api/generated/zod'
import { apiBody, apiJson } from '@/lib/api-client'
import { getAPIUrl } from '@services/config/config'

export type TeacherInterventionCreate = CreateInterventionRequest
export type TeacherInterventionRow = Intervention
export type TeacherInterventionListResponse = InterventionList

const buildQueryString = (query: AnalyticsQuery = {}) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  }
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

const getFirstQueryValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value

const getPositiveInteger = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

async function analyticsRequest<T>(
  path: string,
  parse: (value: unknown) => T,
  query?: AnalyticsQuery,
  init?: RequestInit,
): Promise<T> {
  return apiJson(`analytics/${path}${buildQueryString(query)}`, init, parse)
}

/**
 * `sortKeys` are the `sort_by` values the page's endpoint honours; anything
 * else (a stale bookmark, another page's key) is dropped rather than sent —
 * the server answers 422 for unknown keys (UX-095).
 */
export function normalizeAnalyticsQuery(
  searchParams: Record<string, string | string[] | undefined>,
  sortKeys: readonly string[] = [],
): AnalyticsQuery {
  const teacherUserId = getFirstQueryValue(searchParams.teacher_user_id)
  const page = getFirstQueryValue(searchParams.page)
  const pageSize = getFirstQueryValue(searchParams.page_size)
  const courseIds = getFirstQueryValue(searchParams.course_ids)
  const cohortIds = getFirstQueryValue(searchParams.cohort_ids)
  const timezone = getFirstQueryValue(searchParams.timezone)
  const rawSortBy = getFirstQueryValue(searchParams.sort_by)
  const sortBy = rawSortBy && sortKeys.includes(rawSortBy) ? rawSortBy : undefined
  const bucketStart = getFirstQueryValue(searchParams.bucket_start)

  return {
    window: getFirstQueryValue(searchParams.window) || '28d',
    compare: getFirstQueryValue(searchParams.compare) || 'previous_period',
    bucket: getFirstQueryValue(searchParams.bucket) || 'day',
    page: getPositiveInteger(page, 1),
    page_size: getPositiveInteger(pageSize, 25),
    sort_order: getFirstQueryValue(searchParams.sort_order) || 'desc',
    course_ids: courseIds,
    cohort_ids: cohortIds,
    ...(teacherUserId ? { teacher_user_id: teacherUserId } : {}),
    timezone: timezone || 'UTC',
    sort_by: sortBy,
    bucket_start: bucketStart,
  }
}

export function getTeacherOverview(query?: AnalyticsQuery) {
  return analyticsRequest('teacher/overview', value => TeacherOverviewResponse.parse(value), query)
}

export function getAdminAnalyticsOverview(query?: AnalyticsQuery) {
  return analyticsRequest('admin/overview', value => AdminAnalyticsResponse.parse(value), query)
}

export function getTeacherCourseList(query?: AnalyticsQuery) {
  return analyticsRequest('teacher/courses', value => TeacherCourseListResponse.parse(value), query)
}

export function getTeacherCourseDetailByUuid(courseUuid: string, query?: AnalyticsQuery) {
  return analyticsRequest(
    `teacher/courses/${CourseId.parse(courseUuid)}`,
    value => TeacherCourseDetailResponse.parse(value),
    query,
  )
}

export function getTeacherAssessmentList(query?: AnalyticsQuery) {
  return analyticsRequest('teacher/assessments', value => TeacherAssessmentListResponse.parse(value), query)
}

export interface GetTeacherAssessmentDetailParams {
  assessmentType: AssessmentType
  assessmentId: string
  query?: AnalyticsQuery
}

export function getTeacherAssessmentDetail({ assessmentType, assessmentId, query }: GetTeacherAssessmentDetailParams) {
  return analyticsRequest(
    `teacher/assessments/${AssessmentKind.parse(assessmentType)}/${AssessmentId.parse(assessmentId)}`,
    value => TeacherAssessmentDetailResponse.parse(value),
    query,
  )
}

export function getAtRiskLearners(query?: AnalyticsQuery) {
  return analyticsRequest('teacher/learners/at-risk', value => AtRiskLearnersResponse.parse(value), query)
}

export function createTeacherIntervention(payload: TeacherInterventionCreate, query?: AnalyticsQuery) {
  return analyticsRequest(`teacher/interventions`, value => Intervention.parse(value), query, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': createIdempotencyKey() },
    body: JSON.stringify(CreateInterventionRequest.parse(payload)),
  })
}

export function getTeacherInterventions(
  params: {
    course_id?: string
    user_id?: string
  } = {},
  query?: AnalyticsQuery,
) {
  const scopedQuery = {
    ...query,
    ...(params.course_id !== undefined ? { course_id: params.course_id } : {}),
    ...(params.user_id !== undefined ? { user_id: params.user_id } : {}),
  }
  return analyticsRequest('teacher/interventions', value => InterventionList.parse(value), scopedQuery)
}

export function getSavedAnalyticsViews(query?: AnalyticsQuery) {
  return analyticsRequest('teacher/saved-views', value => SavedViewList.parse(value), query)
}

export function saveAnalyticsView(payload: SavedAnalyticsViewCreate, query?: AnalyticsQuery) {
  return analyticsRequest('teacher/saved-views', value => SavedView.parse(value), query, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(SaveViewRequest.parse(payload)),
  })
}

/** `DELETE analytics/teacher/saved-views/{id}` — 404 unless the view belongs to the caller. */
export function deleteAnalyticsView(viewId: string, query?: AnalyticsQuery) {
  return analyticsRequest(`teacher/saved-views/${encodeURIComponent(viewId)}`, () => undefined, query, {
    method: 'DELETE',
  })
}

export function getTeacherDrillThrough(
  metric: DrillThroughResponse['metric'],
  query?: AnalyticsQuery & {
    course_id?: string
    assessment_type?: AssessmentType
    assessment_id?: string
  },
) {
  return analyticsRequest(`teacher/drill-through/${metric}`, value => DrillThroughResponse.parse(value), query)
}

export function getAnalyticsExportUrl(
  exportName: 'at-risk' | 'grading-backlog' | 'course-progress' | 'assessment-outcomes',
  query?: AnalyticsQuery,
) {
  return `${getAPIUrl()}analytics/teacher/exports/${exportName}.csv${buildQueryString(query)}`
}

/** UTF-8 + BOM CSV in `locale` (UX-114); bytes, since `Response.text()` strips the BOM. */
export async function downloadAnalyticsExport(
  exportUrl: string,
  locale: string,
): Promise<{ blob: Blob; filename: string }> {
  const blob = await apiBody<Blob, 'blob'>(exportUrl, { responseType: 'blob', headers: { 'Accept-Language': locale } })
  const pathWithoutQuery = exportUrl.split('?').shift() ?? exportUrl

  return {
    blob,
    filename: pathWithoutQuery.split('/').pop() ?? 'export.csv',
  }
}
