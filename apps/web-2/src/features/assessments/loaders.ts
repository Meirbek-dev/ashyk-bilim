import type { QueryClient } from '@tanstack/react-query'

import { courseGroupsOptions } from '#/features/course-studio'
import { getActivityOptions } from '#/shared/api/gen/@tanstack/react-query.gen'

import { can, isAssessmentType } from './model/items'
import {
  accessOptions,
  assessmentOptions,
  assessmentReadinessOptions,
  learnersOptions,
  overridesOptions,
} from './queries'

// Route loaders of the studio tabs. The studio layout has already read the activity (course-studio `ensureStudio`);
// an activity of an assessment type also reads its assessment, other types get `false` and keep their own tab.

const activityOf = (queryClient: QueryClient, activityId: string) =>
  queryClient.ensureQueryData(getActivityOptions({ path: { activity_id: activityId } }))

/** Studio layout and `edit`: the assessment behind a quiz, exam or code challenge; false for other activities. */
export async function ensureAssessment(queryClient: QueryClient, activityId: string): Promise<boolean> {
  const activity = await activityOf(queryClient, activityId)
  if (!isAssessmentType(activity.activity_type)) return false
  await queryClient.ensureQueryData(assessmentOptions(activityId))
  return true
}

/** `settings`: also access, the course's groups, overrides, readiness and, for whoever grades, its learners. */
export async function ensureAssessmentSettings(queryClient: QueryClient, activityId: string): Promise<boolean> {
  if (!(await ensureAssessment(queryClient, activityId))) return false
  const assessment = await queryClient.ensureQueryData(assessmentOptions(activityId))
  await Promise.all([
    queryClient.ensureQueryData(accessOptions(assessment.id)),
    queryClient.ensureQueryData(courseGroupsOptions(assessment.course_id)),
    queryClient.ensureQueryData(overridesOptions(assessment.id)),
    queryClient.ensureQueryData(assessmentReadinessOptions(assessment.id)),
    can(assessment, 'grade') ? queryClient.ensureQueryData(learnersOptions(assessment.course_id)) : null,
  ])
  return true
}
