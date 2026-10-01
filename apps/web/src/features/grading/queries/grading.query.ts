'use client'

import { apiBody, apiJson } from '@/lib/api-client'
import type { SubmissionStats, SubmissionStatus, SubmissionsPage } from '@/features/grading/domain'
import { ReviewPage } from '@/lib/api/generated/zod'
import {
  gradebookFromWire,
  reviewItemFromWire,
  statsFromWire,
  teacherSubmissionFromWire,
} from '@/features/grading/domain/wire'
import { queryOptions } from '@tanstack/react-query'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { getCourse, getCurriculum } from '@/lib/api/generated/courses/courses'
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
  /** Server-side `late_only` - pages and totals follow it. */
  lateOnly?: boolean
}

export const GRADEBOOK_POLL_MS = 15_000

export interface CourseGradebookQueryParams {
  page?: number
  pageSize?: number
  search?: string
  activityType?: string
  savedFilter?: string
}

/** v2 status filter values (`ReviewStatus`): `needs_grading` is `pending`. */
function toReviewStatus(status: SubmissionListQueryParams['status']): string | null {
  if (status === 'ALL') return null
  return status.toLowerCase()
}

/**
 * v2 lists submissions as keyset pages; the review UI still thinks in page
 * numbers, so page N is reached by walking N-1 cursors, in the server's
 * `sort`/`order` (BUG-351 - cursors are only valid within one order).
 * A queue that shrank below the requested page answers with the last page
 * actually reached (never a relabelled one), and `total` counts only rows
 * that exist through it: exact when `has_more` is false, a lower bound
 * otherwise.
 * ponytail: O(N) requests for page N - fine for a per-assessment queue.
 */
async function fetchSubmissionsPage(params: SubmissionListQueryParams): Promise<SubmissionsPage> {
  const base = new URLSearchParams()
  const status = toReviewStatus(params.status)
  if (status) base.set('status', status)
  if (params.search) base.set('search', params.search)
  if (params.lateOnly) base.set('late_only', 'true')
  if (params.sortBy === 'final_score' || params.sortBy === 'attempt_number') base.set('sort', params.sortBy)
  if (params.sortDir === 'asc') base.set('order', 'asc')
  base.set('limit', String(params.pageSize))

  let cursor: string | null = null
  let page: ReviewPage = { items: [], next_cursor: null }
  let reached = 0
  while (reached < Math.max(1, params.page)) {
    const query = new URLSearchParams(base)
    if (cursor) query.set('cursor', cursor)
    page = await apiJson(`assessments/${params.assessmentUuid}/submissions?${query}`, undefined, value =>
      ReviewPage.parse(value),
    )
    reached += 1
    cursor = page.next_cursor ?? null
    if (!cursor) break
  }
  const hasMore = Boolean(page.next_cursor)
  return {
    items: page.items.map(reviewItemFromWire),
    page: reached,
    page_size: params.pageSize,
    pages: hasMore ? reached + 1 : reached,
    total: (reached - 1) * params.pageSize + page.items.length,
    has_more: hasMore,
  }
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

/**
 * Walks `GET courses/{id}/gradebook` to the end (keyset - no offset paging in v2).
 * A page is whole learner rows, so the walk is learners / page size long; it never
 * stops short (BUG-265) - a cursor that will not end is an error, not a truncated gradebook.
 */
export async function collectGradebookPages(courseUuid: string, maxPages = 10_000): Promise<GradebookPage[]> {
  const pages: GradebookPage[] = []
  let cursor: string | null = null
  do {
    if (pages.length === maxPages) throw new Error(`Gradebook did not end after ${maxPages} pages`)
    const page: GradebookPage = await fetchGradebookPage(courseUuid, cursor ? { cursor } : undefined)
    pages.push(page)
    cursor = page.next_cursor ?? null
  } while (cursor)
  return pages
}

/**
 * `params` (search/activityType/savedFilter/page) are legacy server-side
 * filters v2's gradebook route does not accept - filtering happens client
 * side in `filterGradebookStudents`/`buildGradebookRollups` on the full,
 * un-paginated result instead (v2 bans offset paging; see AGENTS.md).
 *
 * `live` = the course grading stream (`useCourseGradingEvents`) is connected
 * and invalidates on every event; polling is only the fallback while it is not.
 */
export function courseGradebookQueryOptions(
  courseUuid: string,
  params?: CourseGradebookQueryParams,
  { live = false }: { live?: boolean } = {},
) {
  return queryOptions({
    queryKey: queryKeys.grading.gradebook(courseUuid),
    queryFn: async () => {
      void params
      const [pages, course, curriculum] = await Promise.all([
        collectGradebookPages(courseUuid),
        getCourse(courseUuid),
        getCurriculum(courseUuid),
      ])
      return gradebookFromWire(pages, course, curriculum)
    },
    staleTime: 5000,
    refetchInterval: live ? false : GRADEBOOK_POLL_MS,
    refetchIntervalInBackground: false,
  })
}

/** The server's gradebook CSV (UTF-8 + BOM, header in `locale`), for a Blob download. */
export function downloadGradebookCsv(courseUuid: string, locale: string): Promise<Blob> {
  return apiBody<Blob, 'blob'>(`courses/${courseUuid}/gradebook/export`, {
    responseType: 'blob',
    headers: { 'Accept-Language': locale },
  })
}

export function submissionStatsQueryOptions(assessmentUuid: string) {
  return queryOptions({
    queryKey: queryKeys.grading.stats(assessmentUuid),
    queryFn: async (): Promise<SubmissionStats> =>
      statsFromWire(await apiJson(`assessments/${assessmentUuid}/submissions/stats`)),
    staleTime: 5000,
  })
}

export function submissionsQueryOptions(params: SubmissionListQueryParams) {
  return queryOptions({
    queryKey: queryKeys.grading.submissions(params),
    queryFn: () => fetchSubmissionsPage(params),
  })
}
