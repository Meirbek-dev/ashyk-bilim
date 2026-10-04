import {
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

import { ApiError } from '#/shared/api/errors'
import {
  assessmentReviewQueueInfiniteQueryKey,
  fileGradingHistoryQueryKey,
  fileSubmissionReviewQueueInfiniteQueryKey,
  fileSubmissionReviewStatsOptions,
  fileUrlOptions,
  getActivityAssessmentOptions,
  getActivityFileSubmissionOptions,
  getActivityOptions,
  getAttemptOptions,
  gradebookInfiniteQueryKey,
  gradingHistoryQueryKey,
  groupsForCourseQueryKey,
  itemAnalyticsOptions,
  reviewSubmissionOptions,
  statsOptions,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import {
  assessmentReviewQueue,
  fileGradingHistory,
  fileSubmissionReviewQueue,
  gradebook,
  gradingHistory,
  groupsForCourse,
} from '#/shared/api/gen/sdk.gen'
import type {
  ActivityId,
  AssessmentId,
  CourseId,
  Disposition,
  FileAttemptFileId,
  FileGradingEntry,
  FileSubmissionId,
  GradebookPage,
  GradingEntry,
} from '#/shared/api/gen/types.gen'

import { gradebookQuery } from './model/gradebook'
import { assessmentQuery, fileQuery, nextQueueCursor, type QueuePage, workKind } from './model/queue'
import type { GradebookSearch, QueueSearch } from './route'

// Reads and the route loaders (the writes are in mutations.ts).

const byActivity = (id: ActivityId) => ({ path: { activity_id: id } })

export type Work = { kind: 'assessment'; id: AssessmentId } | { kind: 'file'; id: FileSubmissionId }

export const activityOptions = (id: ActivityId) => getActivityOptions(byActivity(id))
export const assessmentOptions = (id: ActivityId) => getActivityAssessmentOptions(byActivity(id))
export const taskOptions = (id: ActivityId) => getActivityFileSubmissionOptions(byActivity(id))
/** An assessment's counts, of one group when the queue is filtered by it (B-GRD-05, B-GRD-24). */
export const statsOptionsOf = (id: AssessmentId, group?: string) =>
  statsOptions({ path: { assessment_id: id }, ...(group ? { query: { group_id: group } } : {}) })
export const itemStatsOptions = (id: AssessmentId) => itemAnalyticsOptions({ path: { assessment_id: id } })
export const reviewOptions = (id: string) => reviewSubmissionOptions({ path: { submission_id: id } })
export const attemptOptions = (id: string) => getAttemptOptions({ path: { attempt_id: id } })

/** The grading history of a submission (B-GRD-17) or of a file attempt (B-GRD-26); keys from the generated client. */
export const historyOptions = (work: Work, id: string) =>
  queryOptions<GradingEntry[] | FileGradingEntry[], ApiError, GradingEntry[] | FileGradingEntry[]>({
    queryKey:
      work.kind === 'assessment'
        ? gradingHistoryQueryKey({ path: { submission_id: id } })
        : fileGradingHistoryQueryKey({ path: { attempt_id: id } }),
    queryFn: async ({ signal }) =>
      work.kind === 'assessment'
        ? (await gradingHistory({ path: { submission_id: id }, signal, throwOnError: true })).data
        : (await fileGradingHistory({ path: { attempt_id: id }, signal, throwOnError: true })).data,
  })
/** The file queue's counts, of one group when the queue is filtered by it (B-GRD-24, B-GRD-25). */
export const fileStatsOptions = (id: FileSubmissionId, group: string | undefined) =>
  fileSubmissionReviewStatsOptions({
    path: { file_submission_id: id },
    ...(group ? { query: { group_id: group } } : {}),
  })

/**
 * The course's groups for the group filter (B-GRD-24). A grader who may not read groups (403) gets no filter rather
 * than a broken queue.
 */
export const groupsOptions = (courseId: CourseId) =>
  queryOptions({
    queryKey: groupsForCourseQueryKey({ path: { course_id: courseId } }),
    queryFn: async ({ signal }) =>
      groupsForCourse({ path: { course_id: courseId }, signal, throwOnError: true }).then(
        response => response.data,
        (error: unknown) => {
          if (error instanceof ApiError && error.status === 403) return []
          throw error
        },
      ),
  })
/** A short-lived signed URL of a learner's file (1 h): asked for on click, not prefetched per file. */
/** A short-lived signed `path` on our origin; `inline` for a preview in place, else a download. */
export const downloadOptions = (id: FileAttemptFileId, disposition: Disposition = 'attachment') =>
  fileUrlOptions({ path: { file_id: id }, query: { disposition } })

/** 404 and a malformed id (422) are the same "not found" in place. */
const orNotFound = (error: unknown): never => {
  if (error instanceof ApiError && (error.status === 404 || error.status === 422)) throw notFound()
  throw error
}

/** What is graded behind the activity; null for a page, a video, a document. */
async function ensureWork(queryClient: QueryClient, activityId: ActivityId): Promise<Work | null> {
  const activity = await queryClient.ensureQueryData(activityOptions(activityId)).catch(orNotFound)
  const kind = workKind(activity.activity_type)
  if (kind === 'assessment') {
    const assessment = await queryClient.ensureQueryData(assessmentOptions(activityId)).catch(orNotFound)
    return { kind, id: assessment.id }
  }
  if (kind === 'file') return { kind, id: (await queryClient.ensureQueryData(taskOptions(activityId))).id }
  return null
}

/** Every loaded queue of the work, whatever its filters: writes patch or invalidate them all. */
export const queueBaseKey = (work: Work): QueryKey =>
  work.kind === 'assessment'
    ? assessmentReviewQueueInfiniteQueryKey({ path: { assessment_id: work.id } })
    : fileSubmissionReviewQueueInfiniteQueryKey({ path: { file_submission_id: work.id } })

// Composed by hand like collections: the generated infinite options type queryFn as skippable. Both queues answer
// one page shape, so one table serves both (B-GRD-01). Keys still come from the generated client.
export function queueOptions(work: Work, search: QueueSearch) {
  const queryKey: QueryKey =
    work.kind === 'assessment'
      ? assessmentReviewQueueInfiniteQueryKey({ path: { assessment_id: work.id }, query: assessmentQuery(search) })
      : fileSubmissionReviewQueueInfiniteQueryKey({
          path: { file_submission_id: work.id },
          query: fileQuery(search),
        })
  return infiniteQueryOptions<QueuePage, ApiError, InfiniteData<QueuePage>, QueryKey, string | undefined>({
    queryKey,
    queryFn: async ({ pageParam, signal }): Promise<QueuePage> => {
      const cursor = pageParam ? { cursor: pageParam } : {}
      if (work.kind === 'file') {
        const path = { file_submission_id: work.id }
        const query = { ...fileQuery(search), ...cursor }
        return (await fileSubmissionReviewQueue({ path, query, signal, throwOnError: true })).data
      }
      const path = { assessment_id: work.id }
      const query = { ...assessmentQuery(search), ...cursor }
      return (await assessmentReviewQueue({ path, query, signal, throwOnError: true })).data
    },
    initialPageParam: undefined,
    getNextPageParam: nextQueueCursor,
  })
}

/** The queue tab's loader: the first page, the server's counts (B-GRD-05) and the course's groups (B-GRD-24). */
export async function ensureQueue(queryClient: QueryClient, activityId: ActivityId, search: QueueSearch) {
  const work = await ensureWork(queryClient, activityId)
  if (!work) return
  const { course_id: courseId } = await queryClient.ensureQueryData(activityOptions(activityId))
  await Promise.all([
    queryClient.ensureInfiniteQueryData(queueOptions(work, search)),
    work.kind === 'assessment'
      ? queryClient.ensureQueryData(statsOptionsOf(work.id, search.group))
      : queryClient.ensureQueryData(fileStatsOptions(work.id, search.group)),
    queryClient.ensureQueryData(groupsOptions(courseId)),
  ])
}

/** The review page's loader: the work under review and the queue it walks (B-GRD-10). */
export async function ensureReview(
  queryClient: QueryClient,
  activityId: ActivityId,
  submissionId: string,
  search: QueueSearch,
) {
  const work = await ensureWork(queryClient, activityId)
  if (!work) throw notFound()
  await Promise.all([
    (work.kind === 'assessment'
      ? queryClient.ensureQueryData(reviewOptions(submissionId))
      : queryClient.ensureQueryData(attemptOptions(submissionId))
    ).catch(orNotFound),
    queryClient.ensureInfiniteQueryData(queueOptions(work, search)),
  ])
}

export async function ensureResults(queryClient: QueryClient, activityId: ActivityId) {
  const work = await ensureWork(queryClient, activityId)
  if (work?.kind !== 'assessment') return
  await Promise.all([
    queryClient.ensureQueryData(statsOptionsOf(work.id)),
    queryClient.ensureQueryData(itemStatsOptions(work.id)),
  ])
}

// ---- Gradebook (B-GRD-19, B-GRD-20) ----

export const gradebookOptions = (courseId: CourseId, search: GradebookSearch) => {
  const options = { path: { course_id: courseId }, query: gradebookQuery(search) }
  return infiniteQueryOptions<
    GradebookPage,
    ApiError,
    InfiniteData<GradebookPage>,
    ReturnType<typeof gradebookInfiniteQueryKey>,
    string | undefined
  >({
    queryKey: gradebookInfiniteQueryKey(options),
    queryFn: async ({ pageParam, signal }) => {
      const query = { ...options.query, ...(pageParam ? { cursor: pageParam } : {}) }
      return (await gradebook({ path: options.path, query, signal, throwOnError: true })).data
    },
    initialPageParam: undefined,
    getNextPageParam: page => page.next_cursor ?? undefined,
  })
}

export const ensureGradebook = (queryClient: QueryClient, courseId: CourseId, search: GradebookSearch) =>
  Promise.all([
    queryClient.ensureInfiniteQueryData(gradebookOptions(courseId, search)),
    queryClient.ensureQueryData(groupsOptions(courseId)),
  ])
