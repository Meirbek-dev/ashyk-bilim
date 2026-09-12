'use client'

import { apiJson } from '@/lib/api-client'
import type { SubmissionStats, SubmissionStatus, SubmissionsPage } from '@/features/grading/domain'
import { ReviewPage } from '@/lib/api/generated/zod'
import { gradebookFromWire, reviewItemFromWire, statsFromWire, teacherSubmissionFromWire } from '@/features/grading/domain/wire'
import type { FileGradebookSource } from '@/features/grading/domain/wire'
import { getFileSubmissionByActivity, getFileSubmissionReviewQueue } from '@/features/file-submissions/services/file-submissions'
import { queryOptions } from '@tanstack/react-query'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { getCourse, getCurriculum } from '@/lib/api/generated/courses/courses'
import { listCourseAssessments } from '@/lib/api/generated/assessments/assessments'
import { gradebook as fetchGradebookPage } from '@/lib/api/generated/grading/grading'
import type { Curriculum, GradebookPage } from '@/lib/api/generated/zod'

export interface SubmissionListQueryParams {
  assessmentUuid: string
  page: number
  pageSize: number
  search: string
  sortBy: string
  sortDir: 'asc' | 'desc'
  status: SubmissionStatus | 'NEEDS_GRADING' | 'ALL'
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
 * numbers, so page N is reached by walking N-1 cursors. `total`/`pages` are
 * what is knowable: exact once the last page is reached, otherwise "at least".
 * ponytail: O(N) requests for page N — fine for a per-assessment queue.
 */
async function fetchSubmissionsPage(params: SubmissionListQueryParams): Promise<SubmissionsPage> {
  const base = new URLSearchParams()
  const status = toReviewStatus(params.status)
  if (status) base.set('status', status)
  if (params.search) base.set('search', params.search)
  base.set('limit', String(params.pageSize))

  let cursor: string | null = null
  let page: ReviewPage = { items: [], next_cursor: null }
  for (let index = 1; index <= params.page; index += 1) {
    const query = new URLSearchParams(base)
    if (cursor) query.set('cursor', cursor)
    page = await apiJson(`assessments/${params.assessmentUuid}/submissions?${query}`, undefined, ReviewPage.parse)
    cursor = page.next_cursor ?? null
    if (!cursor) break
  }
  const seenBefore = (params.page - 1) * params.pageSize
  const total = seenBefore + page.items.length + (page.next_cursor ? 1 : 0)
  return {
    items: page.items.map(reviewItemFromWire),
    page: params.page,
    page_size: params.pageSize,
    pages: page.next_cursor ? params.page + 1 : params.page,
    total,
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

/** Walks `GET courses/{id}/gradebook` to the end (keyset — no offset paging in v2). */
export async function collectGradebookPages(courseUuid: string, maxPages = 20): Promise<GradebookPage[]> {
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
 * The gradebook route has no file-submission cells (contract gap), so each
 * file-submission activity's config + full review queue is fetched alongside.
 * ponytail: 2+ requests per file activity; a `file_submissions` block on the
 * gradebook route would replace this.
 */
async function collectFileSources(curriculum: Curriculum, maxPages = 20): Promise<FileGradebookSource[]> {
  const activities = curriculum.chapters.flatMap(ch => ch.activities).filter(a => a.activity_type === 'file_submission')
  return Promise.all(
    activities.map(async activity => {
      const config = await getFileSubmissionByActivity(activity.id)
      const items: FileGradebookSource['items'] = []
      let cursor: string | null = null
      for (let index = 0; index < maxPages; index += 1) {
        const page = await getFileSubmissionReviewQueue(config.id, { cursor, limit: 100 })
        items.push(...page.items)
        cursor = page.next_cursor ?? null
        if (!cursor) break
      }
      return { config, items }
    }),
  )
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
      const [pages, course, assessments, curriculum] = await Promise.all([
        collectGradebookPages(courseUuid),
        getCourse(courseUuid),
        listCourseAssessments(courseUuid),
        getCurriculum(courseUuid),
      ])
      return gradebookFromWire(pages, course, assessments, curriculum, await collectFileSources(curriculum))
    },
    staleTime: 5000,
    // v2 has no course-wide grading event stream (only `GET submissions/{id}/events`
    // per submission), so grades landing from another tab arrive by polling.
    refetchInterval: GRADEBOOK_POLL_MS,
    refetchIntervalInBackground: false,
  })
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
    queryFn: () => fetchSubmissionsPage(params),
  })
}
