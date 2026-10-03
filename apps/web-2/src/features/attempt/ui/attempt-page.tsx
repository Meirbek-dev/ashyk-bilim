import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams, useSearch } from '@tanstack/react-router'

import { assessmentOptions } from '../queries'
import { AttemptEntry } from './attempt-entry'
import { AttemptOpen } from './attempt-open'
import { ATTEMPT_ROUTE } from './attempt-frame'

/** The attempt route: without `?attempt` the entry; with it the attempt, a draft or a handed-in result. */
export function AttemptPage() {
  const { activityId } = useParams({ from: ATTEMPT_ROUTE })
  const { attempt } = useSearch({ from: ATTEMPT_ROUTE })
  const { data: assessment } = useSuspenseQuery(assessmentOptions(activityId))
  return attempt ? (
    <AttemptOpen key={attempt} assessment={assessment} attemptId={attempt} />
  ) : (
    <AttemptEntry assessment={assessment} />
  )
}
