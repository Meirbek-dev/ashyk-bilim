import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate, useSearch, Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { DataList } from '#/shared/components/data-list'
import { ListState } from '#/shared/components/list-state'
import { ListPage } from '#/shared/components/templates/list-page'
import { buttonVariants } from '#/shared/ui/button'

import { orderRuns, runState } from '../model/learning'
import { trailOptions } from '../queries'
import { MyCertificates } from './my-certificates'
import { RunItem } from './run-item'
import { StateFilter } from './state-filter'

/** The learner's own courses with the server's progress, filterable by state in the URL, then their certificates. */
export function LearningPage() {
  const { state } = useSearch({ from: '/_authed/learning' })
  const navigate = useNavigate()
  const query = useSuspenseQuery(trailOptions())
  const runs = orderRuns(query.data.runs)
  const shown = state ? runs.filter(run => runState(run) === state) : runs
  return (
    <ListPage
      title={m.learning_title()}
      count={m.learning_course_count({ count: runs.length })}
      filters={runs.length > 0 ? <StateFilter runs={runs} /> : undefined}
      activeFilters={state ? 1 : 0}
    >
      <ListState
        pending={false}
        error={query.error}
        count={shown.length}
        filtered={Boolean(state)}
        emptyText={m.learning_empty()}
        emptyAction={
          <RouterLink to="/courses" className={buttonVariants({ variant: 'outline' })}>
            {m.learning_catalog()}
          </RouterLink>
        }
        onResetFilters={() => void navigate({ to: '/learning', search: {} })}
        onRetry={() => void query.refetch()}
      >
        <DataList items={shown} getKey={run => run.id}>
          {run => <RunItem run={run} />}
        </DataList>
      </ListState>
      <MyCertificates />
    </ListPage>
  )
}
