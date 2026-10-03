import type { ActivityDetail } from '#/shared/api/gen/types.gen'

import { isAssessmentType } from '../model/route'
import { AssessmentPublishSwitch } from './publish-switch'

/** The studio header's published control (course-studio `publishControl`): assessments only, null for the rest. */
export const assessmentPublishControl = (activity: ActivityDetail) =>
  isAssessmentType(activity.activity_type) ? <AssessmentPublishSwitch activity={activity} /> : null
