import { useSuspenseQuery } from '@tanstack/react-query'

import type { AssessmentDetail, SubmissionId } from '#/shared/api/gen/types.gen'

import { submissionOptions } from '../queries'
import { AttemptResult } from './attempt-result'
import { AttemptRunner } from './attempt-runner'

type OpenProps = { assessment: AssessmentDetail; attemptId: SubmissionId }

/** `?attempt=<id>`: an open draft is worked on; anything handed in shows its result. The cache decides live. */
export function AttemptOpen({ assessment, attemptId }: OpenProps) {
  const { data: attempt, dataUpdatedAt } = useSuspenseQuery(submissionOptions(attemptId))
  if (attempt.status === 'draft')
    return <AttemptRunner assessment={assessment} attempt={attempt} receivedAt={dataUpdatedAt} />
  return <AttemptResult assessment={assessment} attempt={attempt} />
}
