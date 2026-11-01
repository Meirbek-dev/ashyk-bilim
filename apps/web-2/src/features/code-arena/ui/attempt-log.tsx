import { useSuspenseQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'

import type { AssessmentDetail } from '#/shared/api/gen/types.gen'

import type { CodeItem } from '../model/arena'
import { attemptsOptions } from '../queries'
import { ARENA_ROUTE } from './arena-route'
import { History } from './history'
import { RunList } from './run-list'

type AttemptLogProps = { challenge: AssessmentDetail; code: CodeItem }

/** Under the statement: the own runs (B-COD-21) and every attempt (`?submission=` opens one, B-COD-11). */
export function AttemptLog({ challenge, code }: AttemptLogProps) {
  const { run, submission } = useSearch({ from: ARENA_ROUTE })
  const { data: attempts } = useSuspenseQuery(attemptsOptions(challenge.id))
  return (
    <>
      <RunList itemId={code.item.id} selected={run} />
      <History attempts={attempts} code={code} selected={submission} />
    </>
  )
}
