import { useParams } from '@tanstack/react-router'

import { WriteLink } from '#/features/conversations'
import type { UserSummary } from '#/shared/api/gen/types.gen'

import type { Work } from '../queries'
import { ReviewNav } from './review-nav'

const ROUTE = '/_authed/teach/courses/$courseId_/activities/$activityId_/submissions/$submissionId'

/** The review's top bar actions: «Написать учащемуся» with the activity as context (docs/DIALOGS.md 9), prev / next. */
export function ReviewActions({ work, user }: { work: Work; user: UserSummary | null }) {
  const { courseId, activityId } = useParams({ from: ROUTE })
  return (
    <>
      {user ? <WriteLink userId={user.id} course={courseId} activity={activityId} learner /> : null}
      <ReviewNav work={work} />
    </>
  )
}
