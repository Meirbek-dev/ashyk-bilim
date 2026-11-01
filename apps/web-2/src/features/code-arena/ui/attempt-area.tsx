import { useSuspenseQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'

import type { AssessmentDetail } from '#/shared/api/gen/types.gen'

import { draftOf, lastHandedIn, type CodeItem } from '../model/arena'
import { attemptsOptions } from '../queries'
import { ARENA_ROUTE } from './arena-route'
import { Entry } from './entry'
import { RunResult } from './run-result'
import { Workspace } from './workspace'

type AttemptAreaProps = { courseId: string; challenge: AssessmentDetail; code: CodeItem }

/**
 * The open attempt in the workspace (its console shows the run in `?run=`), or the entry that starts the next one
 * (B-COD-04) with that run under it: a run opened from «Мои запуски» shows without an open attempt too (B-COD-21).
 */
export function AttemptArea({ courseId, challenge, code }: AttemptAreaProps) {
  const { run } = useSearch({ from: ARENA_ROUTE })
  const { data: attempts, dataUpdatedAt } = useSuspenseQuery(attemptsOptions(challenge.id))
  const draft = draftOf(attempts)
  if (draft)
    return (
      <Workspace
        key={draft.id}
        courseId={courseId}
        challenge={challenge}
        code={code}
        draft={draft}
        receivedAt={dataUpdatedAt}
      />
    )
  return (
    <>
      <Entry
        courseId={courseId}
        assessmentId={challenge.id}
        activityId={challenge.activity_id}
        last={lastHandedIn(attempts)}
      />
      {run ? <RunResult runId={run} /> : null}
    </>
  )
}
