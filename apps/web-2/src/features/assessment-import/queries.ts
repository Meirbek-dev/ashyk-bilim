import type { QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

import { curriculumOptions, ensureWorkspace } from '#/features/course-studio'
import { ApiError } from '#/shared/api/errors'
import {
  commitImportMutation,
  createImportMutation,
  discardImportMutation,
  getActivityAssessmentOptions,
  getActivityAssessmentQueryKey,
  getCurriculumQueryKey,
  getImportOptions,
  getImportQueryKey,
  readinessQueryKey,
  reparseImportMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import type { AssessmentImport, CourseId } from '#/shared/api/gen/types.gen'

// An import is read once (the create's or the re-read's answer goes into its cache); the commit changes the course's
// curriculum (a new test) or the test it loaded the questions into.

export { curriculumOptions }

export const importOptions = (importId: string) => getImportOptions({ path: { import_id: importId } })
/** The test an existing activity holds (replace or append). */
export const targetTestOptions = (activityId: string) =>
  getActivityAssessmentOptions({ path: { activity_id: activityId } })

/** Puts an import's answer into the cache the preview reads. */
export const keepImport = (queryClient: QueryClient, imported: AssessmentImport) =>
  queryClient.setQueryData(getImportQueryKey({ path: { import_id: imported.id } }), imported)

export const createImportOptions = () => createImportMutation()
export const reparseImportOptions = () => reparseImportMutation()
export const discardImportOptions = () => discardImportMutation()

/** The commit: the course's curriculum (a new activity) and the target test with its readiness read again. */
export const commitImportOptions = (courseId: CourseId, target?: { activityId: string; assessmentId: string }) => ({
  ...commitImportMutation(),
  meta: {
    invalidates: [
      getCurriculumQueryKey({ path: { course_id: courseId } }),
      ...(target
        ? [
            getActivityAssessmentQueryKey({ path: { activity_id: target.activityId } }),
            readinessQueryKey({ path: { assessment_id: target.assessmentId } }),
          ]
        : []),
    ],
  },
})

/**
 * Loader: the course must be the caller's to author (as the workspace); the chapters to pick from, and the target test
 * when questions go into an existing one (of this course, else «not found»).
 */
export async function ensureImportPage(queryClient: QueryClient, courseId: CourseId, testActivityId?: string) {
  await ensureWorkspace(queryClient, courseId)
  const [, test] = await Promise.all([
    queryClient.query({ ...curriculumOptions(courseId), staleTime: 'static' }),
    testActivityId
      ? queryClient.query({ ...targetTestOptions(testActivityId), staleTime: 'static' }).catch((error: unknown) => {
          if (error instanceof ApiError && (error.status === 404 || error.status === 422)) throw notFound()
          throw error
        })
      : null,
  ])
  if (test && test.course_id !== courseId) throw notFound()
}
