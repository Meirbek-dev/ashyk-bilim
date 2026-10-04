import type { QueryClient } from '@tanstack/react-query'

import { getActivityOptions } from '#/shared/api/gen/@tanstack/react-query.gen'

import { isAssessmentType } from './model/route'
import {
  accessOptions,
  assessmentOptions,
  assessmentReadinessOptions,
  courseGroupsOptions,
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

/** `settings`: also access, the course's groups and learners, overrides and readiness. */
export async function ensureAssessmentSettings(queryClient: QueryClient, activityId: string): Promise<boolean> {
  if (!(await ensureAssessment(queryClient, activityId))) return false
  // Read fresh: question saves change the assessment's `version` without answering it, and the rules save with it.
  const assessment = await queryClient.fetchQuery({ ...assessmentOptions(activityId), staleTime: 0 })
  await Promise.all([
    queryClient.ensureQueryData(accessOptions(assessment.id)),
    queryClient.ensureQueryData(courseGroupsOptions(assessment.course_id)),
    queryClient.ensureQueryData(overridesOptions(assessment.id)),
    queryClient.ensureQueryData(assessmentReadinessOptions(assessment.id)),
    queryClient.ensureQueryData(learnersOptions(assessment.course_id)),
  ])
  return true
}
