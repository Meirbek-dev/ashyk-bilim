import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

import { ensureLearner } from '#/features/player'
import { ApiError } from '#/shared/api/errors'
import {
  attemptStateOptions,
  attemptStateQueryKey,
  getActivityAssessmentQueryKey,
  getActivityOptions,
  getCodeRunQueryKey,
  learnerCourseStateQueryKey,
  listMyCodeRunsOptions,
  mySubmissionsOptions,
  referenceCheckItemMutation,
  runnerOptions,
  runItemMutation,
  saveSubmissionDraftMutation,
  startSubmissionMutation,
  submitSubmissionMutation,
  updateItemMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import { getActivityAssessment, getCodeRun } from '#/shared/api/gen/sdk.gen'
import type {
  ActivityId,
  AssessmentDetail,
  AssessmentId,
  AssessmentItem,
  AssessmentItemId,
  CodeRun,
  CodeRunId,
  CourseId,
  CodeRunnerInfo,
  LanguageInfo,
  StudentSubmission,
  SubmissionId,
} from '#/shared/api/gen/types.gen'

import { codeItemOf, upsert } from './model/arena'

const byActivity = (id: ActivityId) => ({ path: { activity_id: id } })
const assessmentKey = (activityId: ActivityId) => getActivityAssessmentQueryKey(byActivity(activityId))

/** The challenge behind an activity; null when a learner may not read it yet (unpublished: 404, B-COD-02). */
export const challengeOptions = (activityId: ActivityId) =>
  queryOptions({
    queryKey: assessmentKey(activityId),
    queryFn: async ({ signal }): Promise<AssessmentDetail | null> => {
      try {
        const { data } = await getActivityAssessment({ ...byActivity(activityId), signal, throwOnError: true })
        return data
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
  })

/**
 * The platform's languages (`GET /code/runner`); null while the sandbox is not configured (`runner_configured`,
 * B-COD-09). It changes only with the platform's config: one read per tab.
 */
export const languagesOptions = () => ({
  ...runnerOptions(),
  staleTime: Number.POSITIVE_INFINITY,
  select: (info: CodeRunnerInfo): LanguageInfo[] | null => (info.runner_configured ? info.languages : null),
})

export const stateOptions = (id: AssessmentId) => attemptStateOptions({ path: { assessment_id: id } })
export const attemptsOptions = (id: AssessmentId) => mySubmissionsOptions({ path: { assessment_id: id } })
/** A run by id (`?run=`); null when it is unknown or not the caller's (404): the page shows no verdicts then. */
export const runOptions = (id: CodeRunId) =>
  queryOptions({
    queryKey: getCodeRunQueryKey({ path: { run_id: id } }),
    queryFn: async ({ signal }): Promise<CodeRun | null> => {
      try {
        return (await getCodeRun({ path: { run_id: id }, signal, throwOnError: true })).data
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
  })

/**
 * The caller's "Run"s of the code item, newest first (the server's 20 latest, B-COD-21). Hand-in runs are not here:
 * each is shown with its attempt (B-COD-22), so a hand-in leaves this list as it is.
 */
export const myRunsOptions = (itemId: AssessmentItemId) =>
  listMyCodeRunsOptions({ path: { item_id: itemId }, query: { purpose: 'visible' } })

/** The run a handed-in attempt was graded on (B-COD-22); null before grading or for a grade without one. */
export const finalRunOptions = (itemId: AssessmentItemId, submissionId: SubmissionId) => ({
  ...listMyCodeRunsOptions({
    path: { item_id: itemId },
    query: { submission_id: submissionId, purpose: 'final', limit: 1 },
  }),
  select: (runs: CodeRun[]) => runs[0] ?? null,
})

type ArenaParams = {
  courseId: CourseId
  activityId: ActivityId
  run?: CodeRunId | undefined
  submission?: SubmissionId | undefined
}

/** The code page's loader: an enrolled learner (else 403 in place), a code challenge of the course, its attempts. */
export async function ensureArena(queryClient: QueryClient, { courseId, activityId, run, submission }: ArenaParams) {
  const state = await ensureLearner(queryClient, courseId)
  const entry = state.outline.flatMap(chapter => chapter.activities).find(activity => activity.id === activityId)
  if (entry?.activity_type !== 'code_challenge') throw notFound()
  const names = { title: entry.title, courseTitle: state.title, locked: entry.blocked_reason !== null }
  if (names.locked) return names
  const [challenge] = await Promise.all([
    queryClient.ensureQueryData(challengeOptions(activityId)),
    queryClient.ensureQueryData(languagesOptions()),
  ])
  const code = codeItemOf(challenge)
  if (!challenge || !code) return names
  await Promise.all([
    queryClient.ensureQueryData(stateOptions(challenge.id)),
    queryClient.ensureQueryData(attemptsOptions(challenge.id)),
    queryClient.ensureQueryData(myRunsOptions(code.item.id)),
    run ? queryClient.ensureQueryData(runOptions(run)) : null,
    submission ? queryClient.ensureQueryData(finalRunOptions(code.item.id, submission)) : null,
  ])
  return names
}

// ---- Learner writes: each answers the attempt, which goes into the history instead of a refetch. ----

const putAttempt = (queryClient: QueryClient, assessmentId: AssessmentId) => (attempt: StudentSubmission) =>
  queryClient.setQueryData(attemptsOptions(assessmentId).queryKey, list => list && upsert(list, attempt))

// The player's outline shows the work state; nothing on this page observes it, so it is only marked stale.
const outline = (courseId: CourseId) => learnerCourseStateQueryKey({ path: { course_id: courseId } })

// While an attempt is open the page does not observe "may start": a start leaves it be (the entry is gone), a
// hand-in marks it stale and the page navigates to the result, which reads it again (no second GET in one view).
export const startOptions = (queryClient: QueryClient, courseId: CourseId, assessmentId: AssessmentId) => ({
  ...startSubmissionMutation(),
  onSuccess: putAttempt(queryClient, assessmentId),
  meta: { invalidates: [outline(courseId)] },
})

export const saveOptions = (queryClient: QueryClient, assessmentId: AssessmentId) => ({
  ...saveSubmissionDraftMutation(),
  onSuccess: putAttempt(queryClient, assessmentId),
})

export const submitOptions = (queryClient: QueryClient, courseId: CourseId, assessmentId: AssessmentId) => ({
  ...submitSubmissionMutation(),
  onSuccess: putAttempt(queryClient, assessmentId),
  meta: { invalidates: [attemptStateQueryKey({ path: { assessment_id: assessmentId } }), outline(courseId)] },
})

/**
 * A run answers finished (the server waits for the judge): it goes into the run resource's cache for `?run=` and
 * leads the own runs (B-COD-21).
 */
export const runCodeOptions = (queryClient: QueryClient) => ({
  ...runItemMutation(),
  onSuccess: (run: CodeRun) => {
    queryClient.setQueryData(runOptions(run.id).queryKey, run)
    queryClient.setQueryData(myRunsOptions(run.item_id).queryKey, list => list && upsert(list, run))
  },
})

// ---- Studio ----

/** The studio tab's loader: whether the activity is a code challenge, with its assessment and the languages read. */
export async function ensureCodeStudio(queryClient: QueryClient, activityId: ActivityId) {
  // The layout's loader reads the same activity and answers its 404 / 403: this one only branches.
  const activity = await queryClient.ensureQueryData(getActivityOptions(byActivity(activityId))).catch(() => null)
  if (activity?.activity_type !== 'code_challenge') return { codeChallenge: false }
  await Promise.all([
    queryClient.ensureQueryData(challengeOptions(activityId)),
    queryClient.ensureQueryData(languagesOptions()),
  ])
  return { codeChallenge: true }
}

/** The saved item replaces its copy in the cached assessment (the reference check reads the stored body). */
export const updateCodeOptions = (queryClient: QueryClient, activityId: ActivityId) => ({
  ...updateItemMutation(),
  onSuccess: (item: AssessmentItem) =>
    queryClient.setQueryData<AssessmentDetail | null>(
      assessmentKey(activityId),
      assessment =>
        assessment && {
          ...assessment,
          items: assessment.items.map(row => (row.id === item.id ? item : row)),
          version: item.assessment_version,
        },
    ),
})

/** The stored solutions of one code item against its tests; a retry replays with the same `Idempotency-Key`. */
export const referenceCheckOptions = () => referenceCheckItemMutation()
