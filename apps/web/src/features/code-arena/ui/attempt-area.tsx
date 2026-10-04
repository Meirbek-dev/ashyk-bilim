import { useSuspenseQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'

import type { AssessmentDetail } from '#/shared/api/gen/types.gen'

import { draftOf, type CodeItem } from '../model/arena'
import { attemptsOptions } from '../queries'
import { ARENA_ROUTE } from './arena-route'
import { Entry } from './entry'
import { History } from './history'
import { RunList } from './run-list'
import { RunResult } from './run-result'
import { Workspace } from './workspace'

type AttemptAreaProps = { courseId: string; challenge: AssessmentDetail; code: CodeItem }

/**
 * The open attempt in the editor, or the entry that starts the next one (B-COD-04); the run in `?run=` with its
 * verdicts, the own runs (B-COD-21) and every attempt (`?submission=` opens one).
 */
export function AttemptArea({ courseId, challenge, code }: AttemptAreaProps) {
  const { run, submission } = useSearch({ from: ARENA_ROUTE })
  const { data: attempts } = useSuspenseQuery(attemptsOptions(challenge.id))
  const draft = draftOf(attempts)
  return (
    <>
      {draft ? (
        <Workspace key={draft.id} courseId={courseId} challenge={challenge} code={code} draft={draft} />
      ) : (
        <Entry courseId={courseId} assessmentId={challenge.id} />
      )}
      {run ? <RunResult runId={run} /> : null}
      <RunList itemId={code.item.id} selected={run} />
      <History attempts={attempts} code={code} selected={submission} />
    </>
  )
}
