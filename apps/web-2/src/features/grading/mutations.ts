import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query'

import {
  extendDeadlineMutation,
  getAttemptQueryKey,
  gradeAttemptMutation,
  gradebookInfiniteQueryKey,
  gradingHistoryQueryKey,
  publishGradesMutation,
  reviewSubmissionQueryKey,
  saveGradeMutation,
  statsQueryKey,
  workQueueInfiniteQueryKey,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import { gradeAttempt, saveGrade } from '#/shared/api/gen/sdk.gen'
import type { Attempt, CourseId, TeacherSubmission } from '#/shared/api/gen/types.gen'

import type { QueuePage, QueueRow } from './model/queue'
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

// Counts, the course gradebook and the teacher inbox change with a grade: read again where they are shown next.
const afterGrade = ({ work, courseId, submissionId }: ReviewIds): QueryKey[] => [
  ...(work.kind === 'assessment'
    ? [
        statsQueryKey({ path: { assessment_id: work.id } }),
        gradingHistoryQueryKey({ path: { submission_id: submissionId } }),
      ]
    : []),
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
    ...(work.kind === 'assessment' ? [statsQueryKey({ path: { assessment_id: work.id } })] : []),
    gradebookInfiniteQueryKey({ path: { course_id: courseId } }),
    workQueueInfiniteQueryKey(),
  ],
})

export const publishAllOptions = (work: Work, courseId: CourseId) => ({
  ...publishGradesMutation(),
  meta: bulkMeta(work, courseId),
})

/**
 * "Return for revision" on the selected rows (B-GRD-08): one grade save per row with its own `If-Match`; a refused
 * row is named, the others still go back. One invalidation for the whole batch.
 */
export const returnManyOptions = (work: Work, courseId: CourseId) => ({
  mutationFn: async (rows: readonly QueueRow[]) => {
    const results = await Promise.allSettled(
      rows.map(row => {
        const headers = { 'If-Match': row.version }
        return work.kind === 'assessment'
          ? saveGrade({ path: { submission_id: row.id }, body: { action: 'return' }, headers, throwOnError: true })
          : gradeAttempt({ path: { attempt_id: row.id }, body: { action: 'return' }, headers, throwOnError: true })
      }),
    )
    const failed = rows.filter((_, index) => results[index]?.status === 'rejected')
    return {
      returned: rows.length - failed.length,
      failed: failed.map(row => row.user.display_name || row.user.username),
    }
  },
  meta: bulkMeta(work, courseId),
})

export const extendOptions = (work: Work, courseId: CourseId) => ({
  ...extendDeadlineMutation(),
  meta: bulkMeta(work, courseId),
})
