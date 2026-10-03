import { infiniteQueryOptions, type InfiniteData, type QueryClient } from '@tanstack/react-query'

import type { ApiError } from '#/shared/api/errors'
import {
  adminEvalsOptions,
  adminRunDetailOptions,
  adminRunsInfiniteQueryKey,
  adminSettingsOptions,
  completeRemediationMutation,
  deleteQaThreadMutation,
  dismissLectureSuggestionMutation,
  latestCourseAnalysisOptions,
  latestCourseAnalysisQueryKey,
  latestRemediationOptions,
  latestRemediationQueryKey,
  latestSubmissionAnalysisOptions,
  latestSubmissionAnalysisQueryKey,
  lectureReviewsOptions,
  lectureReviewsQueryKey,
  publishCourseAnalysisMutation,
  qaThreadOptions,
  qaThreadsOptions,
  qaThreadsQueryKey,
  reviewCourseFindingMutation,
  runArtifactsOptions,
  scopeCapabilitiesOptions,
  studentRemediationOptions,
  studentRemediationQueryKey,
  usageOptions,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import {
  adminRuns,
  queueCourseAnalysis,
  queueLectureReview,
  queueRemediation,
  queueSubmissionAnalysis,
  studyAskQueue,
} from '#/shared/api/gen/sdk.gen'
import type {
  ActivityId,
  AdminRunPage,
  AdminRunsData,
  AiRunId,
  AiThreadId,
  CourseAnalysis,
  CourseId,
  LectureReview,
  QaThreadSummary,
  RemediationSession,
  Surface,
  UserId,
} from '#/shared/api/gen/types.gen'

export type Scope = { courseId: CourseId; activityId?: ActivityId | undefined; surface: Surface }

export const capabilitiesOptions = ({ courseId, activityId, surface }: Scope) =>
  scopeCapabilitiesOptions({
    path: { course_id: courseId },
    query: activityId ? { surface, activity_id: activityId } : { surface },
  })

/** Route loaders of the pages with the panel: the panel's own errors stay in the panel (prefetch never throws). */
export const prefetchPanel = (queryClient: QueryClient, scope: Scope) =>
  queryClient.prefetchQuery(capabilitiesOptions(scope))

// ---- Q&A ----
export const threadsOptions = (courseId: CourseId) => qaThreadsOptions({ path: { course_id: courseId } })
export const threadOptions = (courseId: CourseId, threadId: AiThreadId) =>
  qaThreadOptions({ path: { course_id: courseId, thread_id: threadId } })
export const threadsKey = (courseId: CourseId) => qaThreadsQueryKey({ path: { course_id: courseId } })
// A delete answers 204: the thread leaves the cached list (no second read of the list).
export const deleteThreadOptions = (queryClient: QueryClient, courseId: CourseId, threadId: AiThreadId) => ({
  ...deleteQaThreadMutation(),
  onSuccess: () =>
    queryClient.setQueryData(threadsKey(courseId), (threads?: QaThreadSummary[]) =>
      threads?.filter(thread => thread.id !== threadId),
    ),
})

// ---- Runs: each queue answers a RunStatus; the run hook follows it (ui/use-ai-run.ts) ----
const queued = <T>(result: Promise<{ data: T }>) => result.then(({ data }) => data)
export const artifactsOptions = (runId: AiRunId) => runArtifactsOptions({ path: { run_id: runId } })

export const studyQueue = (courseId: CourseId) => (body: Parameters<typeof studyAskQueue>[0]['body']) =>
  queued(studyAskQueue({ path: { course_id: courseId }, body, throwOnError: true }))

// ---- Course analysis ----
export const courseAnalysisOptions = (courseId: CourseId) =>
  latestCourseAnalysisOptions({ path: { course_id: courseId } })
export const courseAnalysisKey = (courseId: CourseId) => latestCourseAnalysisQueryKey({ path: { course_id: courseId } })
export const courseAnalysisQueue = (courseId: CourseId) => (language: string) =>
  queued(queueCourseAnalysis({ path: { course_id: courseId }, body: { language }, throwOnError: true }))
/** Review and publish answer the analysis: it replaces the cached one (spec 7.6), no refetch. */
export const reviewFindingOptions = (queryClient: QueryClient, courseId: CourseId) => ({
  ...reviewCourseFindingMutation(),
  onSuccess: (analysis: CourseAnalysis) => queryClient.setQueryData(courseAnalysisKey(courseId), analysis),
})
export const publishAnalysisOptions = (queryClient: QueryClient, courseId: CourseId) => ({
  ...publishCourseAnalysisMutation(),
  onSuccess: (analysis: CourseAnalysis) => queryClient.setQueryData(courseAnalysisKey(courseId), analysis),
})

// ---- Submission analysis and remediation (the grader's panel, slice 6.1) ----
export const submissionAnalysisOptions = (submissionId: string) =>
  latestSubmissionAnalysisOptions({ path: { submission_id: submissionId } })
export const submissionAnalysisKey = (submissionId: string) =>
  latestSubmissionAnalysisQueryKey({ path: { submission_id: submissionId } })
export const submissionAnalysisQueue = (submissionId: string) => (language: string) =>
  queued(queueSubmissionAnalysis({ path: { submission_id: submissionId }, body: { language }, throwOnError: true }))
export const remediationOptions = (submissionId: string) =>
  latestRemediationOptions({ path: { submission_id: submissionId } })
export const remediationKey = (submissionId: string) =>
  latestRemediationQueryKey({ path: { submission_id: submissionId } })
export const remediationQueue = (submissionId: string) => (language: string) =>
  queued(
    queueRemediation({
      path: { submission_id: submissionId },
      body: { gate_mode: true, language },
      throwOnError: true,
    }),
  )

// ---- The learner's remediation ----
export const sessionsOptions = (userId: UserId) => studentRemediationOptions({ path: { user_id: userId } })
export const completeSessionOptions = (queryClient: QueryClient, userId: UserId) => ({
  ...completeRemediationMutation(),
  onSuccess: (session: RemediationSession) => {
    queryClient.setQueryData(
      studentRemediationQueryKey({ path: { user_id: userId } }),
      (sessions?: RemediationSession[]) => sessions?.map(item => (item.id === session.id ? session : item)),
    )
  },
})

// ---- Lecture critique ----
export const reviewsOptions = (courseId: CourseId) => lectureReviewsOptions({ path: { course_id: courseId } })
export const reviewsKey = (courseId: CourseId) => lectureReviewsQueryKey({ path: { course_id: courseId } })
export const critiqueQueue = (courseId: CourseId, activityId: ActivityId) => (language: string) =>
  queued(
    queueLectureReview({
      path: { course_id: courseId },
      body: { activity_id: activityId, language },
      throwOnError: true,
    }),
  )
// The answer is the updated review: it replaces the cached one.
export const dismissOptions = (queryClient: QueryClient, courseId: CourseId) => ({
  ...dismissLectureSuggestionMutation(),
  onSuccess: (review: LectureReview) =>
    queryClient.setQueryData(reviewsKey(courseId), (reviews?: LectureReview[]) =>
      reviews?.map(item => (item.id === review.id ? review : item)),
    ),
})

// ---- Admin ----
export const settingsOptions = () => adminSettingsOptions()
export const usageSummaryOptions = () => usageOptions()
export const evalsOptions = () => adminEvalsOptions()
export const runDetailOptions = (runId: AiRunId) => adminRunDetailOptions({ path: { run_id: runId } })

type RunsFilter = Omit<NonNullable<AdminRunsData['query']>, 'cursor' | 'limit'>
const RUNS_PAGE = 25

// Composed by hand like the collections list: the generated infinite options type the queryFn as skippable.
export const runsOptions = (filter: RunsFilter) => {
  const options = { query: { ...filter, limit: RUNS_PAGE } }
  return infiniteQueryOptions<
    AdminRunPage,
    ApiError,
    InfiniteData<AdminRunPage>,
    ReturnType<typeof adminRunsInfiniteQueryKey>,
    AiRunId | undefined
  >({
    queryKey: adminRunsInfiniteQueryKey(options),
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await adminRuns({
        query: { ...options.query, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
        throwOnError: true,
      })
      return data
    },
    initialPageParam: undefined,
    getNextPageParam: page => page.next_cursor ?? undefined,
  })
}
