import type { QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

import { ApiError } from '#/shared/api/errors'
import {
  courseReadinessQueryKey,
  createActivityMutation,
  createAssessmentMutation,
  createBlockMutation,
  createChapterMutation,
  createFileSubmissionMutation,
  deleteActivityMutation,
  deleteChapterMutation,
  getActivityOptions,
  getActivityQueryKey,
  getCurriculumOptions,
  getCurriculumQueryKey,
  moveActivityMutation,
  moveChapterMutation,
  updateActivityMutation,
  updateChapterMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import type { Activity, ActivityDetail, Chapter, CourseId, Curriculum } from '#/shared/api/gen/types.gen'

import { withActivity, withChapter, withoutActivity, withoutChapter } from './model/curriculum'

// Curriculum and activity writes. Each answer (or, for a 204, the change itself) goes into the curriculum cache:
// a refetch would repeat the page's GET. Readiness depends on what is published, so it is read again where shown.

const byId = (id: CourseId) => ({ path: { course_id: id } })
const readiness = (courseId: CourseId) => courseReadinessQueryKey(byId(courseId))

export const curriculumOptions = (courseId: CourseId) => getCurriculumOptions(byId(courseId))
export const activityOptions = (id: string) => getActivityOptions({ path: { activity_id: id } })

const patch = (queryClient: QueryClient, courseId: CourseId, change: (curriculum: Curriculum) => Curriculum) =>
  queryClient.setQueryData<Curriculum>(
    getCurriculumQueryKey(byId(courseId)),
    curriculum => curriculum && change(curriculum),
  )

export const createChapterOptions = (queryClient: QueryClient, courseId: CourseId) => ({
  ...createChapterMutation(),
  onSuccess: (chapter: Chapter) => patch(queryClient, courseId, curriculum => withChapter(curriculum, chapter)),
})

export const updateChapterOptions = (queryClient: QueryClient, courseId: CourseId) => ({
  ...updateChapterMutation(),
  onSuccess: (chapter: Chapter) => patch(queryClient, courseId, curriculum => withChapter(curriculum, chapter)),
})

/** "Reload and retry" after a 412: the chapter's current `version` (a deleted one keeps its own: the write 404s). */
export const chapterVersion = async (queryClient: QueryClient, courseId: CourseId, chapter: Chapter) =>
  (await queryClient.fetchQuery({ ...curriculumOptions(courseId), staleTime: 0 })).chapters.find(
    row => row.id === chapter.id,
  )?.version ?? chapter.version

export const deleteChapterOptions = (queryClient: QueryClient, courseId: CourseId) => ({
  ...deleteChapterMutation(),
  onSuccess: (_: unknown, { path }: { path: { chapter_id: string } }) =>
    patch(queryClient, courseId, curriculum => withoutChapter(curriculum, path.chapter_id)),
  meta: { invalidates: [readiness(courseId)] },
})

/** A dragged order goes into the cache before its request (it is already on screen); a refusal puts back `before`. */
export const placeCurriculum = (queryClient: QueryClient, courseId: CourseId, curriculum: Curriculum) =>
  queryClient.setQueryData<Curriculum>(getCurriculumQueryKey(byId(courseId)), curriculum)

// A chapter move renumbers its siblings and bumps their `version`: the curriculum is read again for the next rename.
export const moveChapterOptions = (courseId: CourseId) => ({
  ...moveChapterMutation(),
  meta: { invalidates: [getCurriculumQueryKey(byId(courseId))] },
})
export const moveActivityOptions = () => moveActivityMutation()

export const createActivityOptions = (queryClient: QueryClient, courseId: CourseId) => ({
  ...createActivityMutation(),
  onSuccess: (activity: Activity) => patch(queryClient, courseId, curriculum => withActivity(curriculum, activity)),
})

// Assessments and file submissions answer their own object, not the activity: the curriculum is read again.
export const createAssessmentOptions = (courseId: CourseId) => ({
  ...createAssessmentMutation(),
  meta: { invalidates: [getCurriculumQueryKey(byId(courseId))] },
})

export const createFileSubmissionOptions = (courseId: CourseId) => ({
  ...createFileSubmissionMutation(),
  meta: { invalidates: [getCurriculumQueryKey(byId(courseId))] },
})

/** The answer carries the new `version`: the activity and its curriculum row take it. */
export const updateActivityOptions = (queryClient: QueryClient, courseId: CourseId) => ({
  ...updateActivityMutation(),
  onSuccess: (activity: ActivityDetail) => {
    queryClient.setQueryData(getActivityQueryKey({ path: { activity_id: activity.id } }), activity)
    patch(queryClient, courseId, curriculum => withActivity(curriculum, activity))
  },
  meta: { invalidates: [readiness(courseId)] },
})

export const deleteActivityOptions = (queryClient: QueryClient, courseId: CourseId) => ({
  ...deleteActivityMutation(),
  onSuccess: (_: unknown, { path }: { path: { activity_id: string } }) =>
    patch(queryClient, courseId, curriculum => withoutActivity(curriculum, path.activity_id)),
  meta: { invalidates: [readiness(courseId)] },
})

/** Claims an upload as a file block of the activity (otherwise storage reaps it). */
export const claimOptions = () => createBlockMutation()

/** Studio loader: an unknown activity is "not found"; one the caller may not change is a 403 in place. */
export async function ensureStudio(queryClient: QueryClient, courseId: CourseId, activityId: string) {
  const activity = await queryClient.ensureQueryData(activityOptions(activityId)).catch((error: unknown) => {
    if (error instanceof ApiError && (error.status === 404 || error.status === 422)) throw notFound()
    throw error
  })
  if (activity.course_id !== courseId) throw notFound()
  if (!activity.allowed_actions.includes('update')) {
    throw new ApiError({ status: 403, code: 'forbidden', fieldErrors: [], requestId: null, retryAfter: null })
  }
  return activity
}
