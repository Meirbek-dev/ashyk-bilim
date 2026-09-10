'use client'

import { apiJson } from '@/lib/api-client'
import type {
  SubmissionStats,
  SubmissionStatus,
  SubmissionsPage,
} from '@/features/grading/domain'
import { normalizeSubmissionsPage } from '@/features/grading/domain'
import { gradebookFromWire, statsFromWire, teacherSubmissionFromWire } from '@/features/grading/domain/wire'
import { queryOptions } from '@tanstack/react-query'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { getAPIUrl } from '@services/config/config'
import { getCourse } from '@/lib/api/generated/courses/courses'
import { listCourseAssessments } from '@/lib/api/generated/assessments/assessments'
import { gradebook as fetchGradebookPage } from '@/lib/api/generated/grading/grading'
import type { GradebookPage } from '@/lib/api/generated/zod'

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
    // The grader's view (`TeacherSubmission`) lives at `/review`; the plain
    // `GET /submissions/{id}` is the learner's own read-only view.
    queryFn: async () => teacherSubmissionFromWire(await apiJson(`submissions/${submissionUuid}/review`)),
    staleTime: 2000,
  })
}

/** Walks `GET courses/{id}/gradebook` to the end (keyset — no offset paging in v2). */
async function collectGradebookPages(courseUuid: string, maxPages = 20): Promise<GradebookPage[]> {
  const pages: GradebookPage[] = []
  let cursor: string | null = null
  for (let index = 0; index < maxPages; index += 1) {
    const page = await fetchGradebookPage(courseUuid, cursor ? { cursor } : undefined)
    pages.push(page)
    if (!page.next_cursor) break
    cursor = page.next_cursor
  }
  return pages
}

/**
 * `params` (search/activityType/savedFilter/page) are legacy server-side
 * filters v2's gradebook route does not accept — filtering happens client
 * side in `filterGradebookStudents`/`buildGradebookRollups` on the full,
 * un-paginated result instead (v2 bans offset paging; see AGENTS.md).
 */
export function courseGradebookQueryOptions(courseUuid: string, params?: CourseGradebookQueryParams) {
  return queryOptions({
    queryKey: queryKeys.grading.gradebook(courseUuid),
    queryFn: async () => {
      void params
      const [pages, course, assessments] = await Promise.all([
        collectGradebookPages(courseUuid),
        getCourse(courseUuid),
        listCourseAssessments(courseUuid),
      ])
      return gradebookFromWire(pages, course, assessments)
    },
    staleTime: 5000,
  })
}

export function courseGradebookExportUrl(courseUuid: string) {
  // BLOCKED: v2 has no course-level gradebook CSV export (only per-assessment
  // `GET assessments/{id}/submissions/export`). Left pointed at the legacy
  // path; see report under "Blocked".
  return `${getAPIUrl()}grading/courses/${courseUuid}/gradebook/export`
}

export function submissionStatsQueryOptions(assessmentUuid: string) {
  return queryOptions({
    queryKey: queryKeys.grading.stats(assessmentUuid),
    queryFn: async (): Promise<SubmissionStats> => statsFromWire(await apiJson(`assessments/${assessmentUuid}/submissions/stats`)),
    staleTime: 5000,
  })
}

export function submissionsQueryOptions(params: SubmissionListQueryParams) {
  return queryOptions({
    queryKey: queryKeys.grading.submissions(params),
    queryFn: async () => {
      const path = `assessments/${params.assessmentUuid}/submissions`
      return normalizeSubmissionsPage(await apiJson<SubmissionsPage>(`${path}?${buildSubmissionsSearchParams(params)}`))
    },
  })
}
