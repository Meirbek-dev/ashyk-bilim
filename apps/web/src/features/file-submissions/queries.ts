import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

import { ensureLearner } from '#/features/player'
import { ApiError } from '#/shared/api/errors'
import {
  courseReadinessQueryKey,
  fileUrlOptions,
  getActivityFileSubmissionQueryKey,
  getActivityOptions,
  getActivityQueryKey,
  getCurriculumQueryKey,
  learnerCourseStateQueryKey,
  myAttemptsOptions,
  publishFileSubmissionMutation,
  saveFileSubmissionDraftMutation,
  startDraftMutation,
  submitMutation,
  updateFileSubmissionMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import { getActivityFileSubmission } from '#/shared/api/gen/sdk.gen'
import type {
  ActivityDetail,
  ActivityId,
  Attempt,
  CourseId,
  Disposition,
  FileAttemptFileId,
  FileSubmission,
  FileSubmissionId,
} from '#/shared/api/gen/types.gen'

import { upsertAttempt, withAttempt } from './model/task'

const byActivity = (id: ActivityId) => ({ path: { activity_id: id } })
const byCourse = (id: CourseId) => ({ path: { course_id: id } })

const taskKey = (activityId: ActivityId) => getActivityFileSubmissionQueryKey(byActivity(activityId))

/**
 * The task behind an activity; null when the caller may not read a config (a learner gets 404 for a missing or
 * unpublished one: "not set up yet", B-FSB-02).
 */
export const taskOptions = (activityId: ActivityId) =>
  queryOptions({
    queryKey: taskKey(activityId),
    queryFn: async ({ signal }): Promise<FileSubmission | null> => {
      try {
        const { data } = await getActivityFileSubmission({ ...byActivity(activityId), signal, throwOnError: true })
        return data
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
  })

/** Every attempt of the caller, newest first (`/me`). */
export const historyOptions = (id: FileSubmissionId) => myAttemptsOptions({ path: { file_submission_id: id } })

/** A short-lived signed URL of an own file (1 h): asked for on click, not prefetched per file. */
/** A short-lived signed `path` on our origin; `inline` for a preview in place, else a download. */
export const downloadOptions = (id: FileAttemptFileId, disposition: Disposition = 'attachment') =>
  fileUrlOptions({ path: { file_id: id }, query: { disposition } })

/** The submission page's loader: an enrolled learner (else 403 in place), a file-submission activity of the course. */
export async function ensureSubmission(queryClient: QueryClient, courseId: CourseId, activityId: ActivityId) {
  const state = await ensureLearner(queryClient, courseId)
  const entry = state.outline.flatMap(chapter => chapter.activities).find(activity => activity.id === activityId)
  if (entry?.activity_type !== 'file_submission') throw notFound()
  if (!entry.blocked_reason) {
    const task = await queryClient.ensureQueryData(taskOptions(activityId))
    if (task) await queryClient.ensureQueryData(historyOptions(task.id))
  }
  // Names for the page, not the learner state itself: the page does not observe it, so a hand-in that invalidates it
  // (for the player's outline) does not refetch it here.
  return { title: entry.title, courseTitle: state.title, locked: entry.blocked_reason !== null }
}

// ---- Learner writes: each answers the attempt, which goes into the task and the history instead of a refetch. ----

export type WorkIds = { courseId: CourseId; activityId: ActivityId; taskId: FileSubmissionId }

function putAttempt(queryClient: QueryClient, { activityId, taskId }: WorkIds) {
  return (attempt: Attempt) => {
    queryClient.setQueryData<FileSubmission | null>(taskKey(activityId), task => task && withAttempt(task, attempt))
    queryClient.setQueryData(historyOptions(taskId).queryKey, list => list && upsertAttempt(list, attempt))
  }
}

// The player's outline shows the work state: it is read again when the player opens.
const progress = ({ courseId }: WorkIds) => ({ invalidates: [learnerCourseStateQueryKey(byCourse(courseId))] })

export const draftOptions = (queryClient: QueryClient, ids: WorkIds) => ({
  ...saveFileSubmissionDraftMutation(),
  onSuccess: putAttempt(queryClient, ids),
  meta: progress(ids),
})

export const submitOptions = (queryClient: QueryClient, ids: WorkIds) => ({
  ...submitMutation(),
  onSuccess: putAttempt(queryClient, ids),
  meta: progress(ids),
})

export const startOptions = (queryClient: QueryClient, ids: WorkIds) => ({
  ...startDraftMutation(),
  onSuccess: putAttempt(queryClient, ids),
  meta: progress(ids),
})

// ---- Studio ----

/** The studio tab's loader: whether the activity is a file submission, with its config read. */
export async function ensureTaskStudio(queryClient: QueryClient, activityId: ActivityId) {
  // The layout's loader reads the same activity and answers its 404 / 403: this one only branches.
  const activity = await queryClient.ensureQueryData(getActivityOptions(byActivity(activityId))).catch(() => null)
  if (activity?.activity_type !== 'file_submission') return { fileSubmission: false }
  await queryClient.ensureQueryData(taskOptions(activityId))
  return { fileSubmission: true }
}

export const updateTaskOptions = (queryClient: QueryClient, activityId: ActivityId) => ({
  ...updateFileSubmissionMutation(),
  onSuccess: (task: FileSubmission) => queryClient.setQueryData(taskKey(activityId), task),
})

/**
 * Publishing also flips the activity live, which bumps its version; the answer does not carry the activity, so the
 * header switch's cached activity takes both by hand (a refetch would repeat the page's GET).
 */
export const publishTaskOptions = (queryClient: QueryClient, courseId: CourseId, activityId: ActivityId) => ({
  ...publishFileSubmissionMutation(),
  onSuccess: (task: FileSubmission) => {
    queryClient.setQueryData(taskKey(activityId), task)
    queryClient.setQueryData<ActivityDetail>(getActivityQueryKey(byActivity(activityId)), activity =>
      activity && !activity.published ? { ...activity, published: true, version: activity.version + 1 } : activity,
    )
  },
  meta: { invalidates: [getCurriculumQueryKey(byCourse(courseId)), courseReadinessQueryKey(byCourse(courseId))] },
})
