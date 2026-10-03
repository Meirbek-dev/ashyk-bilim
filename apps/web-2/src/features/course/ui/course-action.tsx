import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { Course } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/ui/link'

import { primaryAction, type ActivityActionId } from '../model/course'
import { learnerStateOptions } from '../queries'
import { EnrollButton } from './enroll-button'

const activityActionLabels = {
  start: m.course_next_start,
  continue: m.course_next_continue,
  revise: m.course_next_revise,
  view_feedback: m.course_next_view_feedback,
  wait_for_grade: m.course_next_wait_for_grade,
} satisfies Record<ActivityActionId, () => string>

const completeLabels = {
  view_certificate: m.course_next_view_certificate,
  review_completion: m.course_next_review_completion,
}

/** A signed-in user's one primary action, from the learner state the server computed (spec 7.6). */
export function LearnerAction({ course }: { course: Course }) {
  const { data: state } = useSuspenseQuery(learnerStateOptions(course.id))
  const action = primaryAction(course, state)
  const params = { courseId: course.id }
  if (action?.kind === 'enroll') return <EnrollButton courseId={course.id} />
  if (action?.kind === 'activity')
    return (
      <Link to="/learn/$courseId/$activityId" params={{ ...params, activityId: action.activityId }} variant="primary">
        {activityActionLabels[action.action]()}
      </Link>
    )
  if (action?.kind === 'complete')
    return (
      <Link to="/learn/$courseId/complete" params={params} variant="primary">
        {completeLabels[action.action]()}
      </Link>
    )
  if (action?.kind === 'workspace')
    return (
      <Link to="/teach/courses/$courseId/overview" params={params} variant="primary">
        {m.platform_page_course_workspace()}
      </Link>
    )
  return null
}
