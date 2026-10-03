import type { ActivityType, AssessmentAction, AssessmentDetail, AssessmentKind } from '#/shared/api/gen/types.gen'

// What the route files need before a tab's code loads (loader, search): kept apart from the builder's model so the
// initial bundle carries only this.

const ASSESSMENT_TYPES = ['quiz', 'exam', 'code_challenge'] as const satisfies readonly ActivityType[]

/** The activity types backed by an assessment (`/activities/{id}/assessment`). */
export const isAssessmentType = (type: ActivityType): type is AssessmentKind =>
  (ASSESSMENT_TYPES as readonly string[]).includes(type)

export const can = (assessment: Pick<AssessmentDetail, 'allowed_actions'>, action: AssessmentAction): boolean =>
  assessment.allowed_actions.includes(action)
