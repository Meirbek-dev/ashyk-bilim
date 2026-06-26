'use client'

import { apiFetcher } from '@/lib/api-client'
import type {
  CourseGradebookResponse,
  Submission,
  SubmissionStats,
  SubmissionStatus,
  SubmissionsPage,
} from '@/features/grading/domain'
import { queryOptions } from '@tanstack/react-query'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { getAPIUrl } from '@services/config/config'

export interface SubmissionListQueryParams {
  assessmentUuid: string
  page: number
  pageSize: number
  search: string
  sortBy: string
  sortDir: 'asc' | 'desc'
  status: SubmissionStatus | 'NEEDS_GRADING' | 'ALL'
}

export interface CourseGradebookQueryParams {
  page?: number
  pageSize?: number
  search?: string
  activityType?: string
  savedFilter?: string
}

function buildSubmissionsSearchParams(params: SubmissionListQueryParams) {
  const searchParams = new URLSearchParams()
  if (params.status !== 'ALL') searchParams.set('status', params.status)
  if (params.search) searchParams.set('search', params.search)
  searchParams.set('sort_by', params.sortBy)
  searchParams.set('sort_dir', params.sortDir)
  searchParams.set('page', String(params.page))
  searchParams.set('page_size', String(params.pageSize))
  return searchParams.toString()
}

export function gradingDetailQueryOptions(submissionUuid: string, assessmentUuid: string) {
  return queryOptions({
    queryKey: queryKeys.grading.detail(submissionUuid, assessmentUuid),
    queryFn: () => apiFetcher<Submission>(`assessments/${assessmentUuid}/submissions/${submissionUuid}`),
    staleTime: 2000,
  })
}

function buildCourseGradebookSearchParams(params?: CourseGradebookQueryParams) {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.pageSize) searchParams.set('page_size', String(params.pageSize))
  if (params?.search) searchParams.set('search', params.search)
  if (params?.activityType && params.activityType !== 'all') searchParams.set('activity_type', params.activityType)
  if (params?.savedFilter && params.savedFilter !== 'all') searchParams.set('saved_filter', params.savedFilter)
  return searchParams.toString()
}

export function courseGradebookQueryOptions(courseUuid: string, params?: CourseGradebookQueryParams) {
  const query = buildCourseGradebookSearchParams(params)
  return queryOptions({
    queryKey: [...queryKeys.grading.gradebook(courseUuid), params ?? {}] as const,
    queryFn: () =>
      apiFetcher<CourseGradebookResponse>(`grading/courses/${courseUuid}/gradebook${query ? `?${query}` : ''}`),
    staleTime: 5000,
  })
}

export function courseGradebookExportUrl(courseUuid: string) {
  return `${getAPIUrl()}grading/courses/${courseUuid}/gradebook/export`
}

export function submissionStatsQueryOptions(assessmentUuid: string) {
  return queryOptions({
    queryKey: queryKeys.grading.stats(assessmentUuid),
    queryFn: () => apiFetcher<SubmissionStats>(`assessments/${assessmentUuid}/submissions/stats`),
    staleTime: 5000,
  })
}

export function submissionsQueryOptions(params: SubmissionListQueryParams) {
  return queryOptions({
    queryKey: queryKeys.grading.submissions(params),
    queryFn: () => {
      const path = `assessments/${params.assessmentUuid}/submissions`
      return apiFetcher<SubmissionsPage>(`${path}?${buildSubmissionsSearchParams(params)}`)
    },
  })
}
