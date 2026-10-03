import { asyncRetry } from '@tanstack/react-pacer'
import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query'

import {
  fileGradingHistoryQueryKey,
  fileSubmissionReviewStatsQueryKey,
  getAttemptQueryKey,
  gradeAttemptMutation,
  gradebookInfiniteQueryKey,
  gradingHistoryQueryKey,
  reviewSubmissionQueryKey,
  saveGradeMutation,
  statsQueryKey,
  workQueueInfiniteQueryKey,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import {
  extendDeadline,
  extendFileDeadline,
  getBulkAction,
  publishFileGrades,
  publishGrades,
  returnFileGrades,
  returnGrades,
} from '#/shared/api/gen/sdk.gen'
import type {
  Attempt,
  BulkActionId,
  BulkGradeSummary,
  CourseId,
  DeadlineExtensionRequest,
  TeacherSubmission,
} from '#/shared/api/gen/types.gen'

import { type ExtendOutcome, extendOutcome, type QueuePage, type QueueRow } from './model/queue'
import { queueBaseKey, type Work } from './queries'

// The grading writes, apart from queries.ts: only the lazy screens import them, so the route entry stays light.

/** The saved work replaces its row in every loaded page of the queue (no refetch of the page being walked). */
function patchQueue(queryClient: QueryClient, work: Work, saved: TeacherSubmission | Attempt) {
  const patch = (row: QueueRow): QueueRow => {
    if (row.id !== saved.id) return row
    const change = {
      allowed_actions: saved.allowed_actions,
      final_score: saved.final_score,
      graded_at_unix: saved.graded_at_unix,
      version: saved.version,
    }
    if ('auto_score' in row && 'assessment_id' in saved) return { ...row, ...change, status: saved.status }
    if ('file_count' in row && 'files' in saved) return { ...row, ...change, status: saved.status }
    return row
  }
  queryClient.setQueriesData<InfiniteData<QueuePage>>({ queryKey: queueBaseKey(work) }, data =>
    data ? { ...data, pages: data.pages.map(page => ({ ...page, items: page.items.map(patch) })) } : data,
  )
}

export type ReviewIds = { work: Work; courseId: CourseId; submissionId: string }

/** The work's counts, whatever group they were asked for. */
const statsKey = (work: Work): QueryKey =>
  work.kind === 'assessment'
    ? statsQueryKey({ path: { assessment_id: work.id } })
    : fileSubmissionReviewStatsQueryKey({ path: { file_submission_id: work.id } })

// Counts, history, the course gradebook and the teacher inbox change with a grade: read again where shown next.
const afterGrade = ({ work, courseId, submissionId }: ReviewIds): QueryKey[] => [
  statsKey(work),
  work.kind === 'assessment'
    ? gradingHistoryQueryKey({ path: { submission_id: submissionId } })
    : fileGradingHistoryQueryKey({ path: { attempt_id: submissionId } }),
  gradebookInfiniteQueryKey({ path: { course_id: courseId } }),
  workQueueInfiniteQueryKey(),
]

export const saveGradeOptions = (queryClient: QueryClient, ids: ReviewIds) => ({
  ...saveGradeMutation(),
  onSuccess: (saved: TeacherSubmission) => {
    queryClient.setQueryData(reviewSubmissionQueryKey({ path: { submission_id: saved.id } }), saved)
    patchQueue(queryClient, ids.work, saved)
  },
  meta: { invalidates: afterGrade(ids) },
})

export const gradeAttemptOptions = (queryClient: QueryClient, ids: ReviewIds) => ({
  ...gradeAttemptMutation(),
  onSuccess: (saved: Attempt) => {
    queryClient.setQueryData(getAttemptQueryKey({ path: { attempt_id: saved.id } }), saved)
    patchQueue(queryClient, ids.work, saved)
  },
  meta: { invalidates: afterGrade(ids) },
})

/** Bulk writes change many rows at once: the queue, its counts and the gradebook are read again. */
const bulkMeta = (work: Work, courseId: CourseId) => ({
  invalidates: [
    queueBaseKey(work),
    statsKey(work),
    gradebookInfiniteQueryKey({ path: { course_id: courseId } }),
    workQueueInfiniteQueryKey(),
  ],
})

/** What publish-all came to (B-GRD-07, B-GRD-25); only an assessment tells how many still wait for grading. */
export type PublishOutcome = { published: number; skipped: number; pending: number | null }

export const publishAllOptions = (work: Work, courseId: CourseId) => ({
  mutationFn: async (): Promise<PublishOutcome> => {
    if (work.kind === 'file') {
      const path = { file_submission_id: work.id }
      const { data } = await publishFileGrades({ path, throwOnError: true })
      return { published: data.done_count, skipped: data.skipped_count, pending: null }
    }
    const { data } = await publishGrades({ path: { assessment_id: work.id }, throwOnError: true })
    return { published: data.published_count, skipped: data.skipped_count, pending: data.needs_grading_count }
  },
  meta: bulkMeta(work, courseId),
})

/** "Return for revision" on the selected rows in one call (B-GRD-08): the server counts returned and skipped rows. */
export const returnManyOptions = (work: Work, courseId: CourseId) => ({
  mutationFn: async (rows: readonly QueueRow[]): Promise<BulkGradeSummary> => {
    const ids = rows.map(row => row.id)
    const { data } =
      work.kind === 'assessment'
        ? await returnGrades({ path: { assessment_id: work.id }, body: { submission_ids: ids }, throwOnError: true })
        : await returnFileGrades({
            path: { file_submission_id: work.id },
            body: { attempt_ids: ids },
            throwOnError: true,
          })
    return data
  },
  meta: bulkMeta(work, courseId),
})

/**
 * An assessment extension is a bulk action the worker runs (202): getBulkAction is asked once a second until it
 * settles, so the queue is read again only once lateness is re-judged (B-GRD-27). Unsettled after 20 tries (or the
 * check itself failing) reads as `queued`: the extension was accepted and the worker still applies it. One retryer
 * per extension: a retryer aborts its previous run.
 */
async function settle(id: BulkActionId): Promise<ExtendOutcome> {
  const check = async (): Promise<ExtendOutcome> => {
    const outcome = extendOutcome((await getBulkAction({ path: { bulk_action_id: id }, throwOnError: true })).data)
    if (outcome.state === 'queued') throw new Error('bulk action still running')
    return outcome
  }
  const retry = asyncRetry(check, { backoff: 'fixed', baseWait: 1000, maxAttempts: 20, throwOnError: false })
  return (await retry()) ?? { state: 'queued', count: 0 }
}

/** "Extend deadline" for selected learners (B-GRD-09): a file submission's is done in the call (B-GRD-25). */
export const extendOptions = (work: Work, courseId: CourseId) => ({
  mutationFn: async (body: DeadlineExtensionRequest): Promise<ExtendOutcome> => {
    if (work.kind === 'file') {
      const path = { file_submission_id: work.id }
      const { data } = await extendFileDeadline({ path, body, throwOnError: true })
      return { state: 'done', count: data.done_count }
    }
    const { data: action } = await extendDeadline({ path: { assessment_id: work.id }, body, throwOnError: true })
    return settle(action.id)
  },
  meta: bulkMeta(work, courseId),
})
