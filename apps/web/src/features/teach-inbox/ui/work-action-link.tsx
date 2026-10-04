import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { WorkItem } from '#/shared/api/gen/types.gen'
import { buttonVariants } from '#/shared/ui/button'

import { type RowAction, rowAction, submissionIdOf } from '../model/inbox'

const actionLabels = {
  grade: m.inbox_action_grade,
  review: m.inbox_action_review,
} satisfies Record<RowAction, () => string>

/** The row's action from `allowed_actions`: straight into that submission's review, else the activity's queue. */
export function WorkActionLink({ item }: { item: WorkItem }) {
  const action = rowAction(item)
  if (!action) return null
  const className = buttonVariants({ variant: 'outline' })
  const params = { courseId: item.course_id, activityId: item.activity_id }
  const submissionId = submissionIdOf(item)
  return submissionId ? (
    <RouterLink
      className={className}
      to="/teach/courses/$courseId/activities/$activityId/submissions/$submissionId"
      params={{ ...params, submissionId }}
    >
      {actionLabels[action]()}
    </RouterLink>
  ) : (
    <RouterLink className={className} to="/teach/courses/$courseId/activities/$activityId/submissions" params={params}>
      {actionLabels[action]()}
    </RouterLink>
  )
}
