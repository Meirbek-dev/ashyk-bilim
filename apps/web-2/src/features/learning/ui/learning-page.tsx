import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate, useSearch, Link as RouterLink } from '@tanstack/react-router'
import { Award } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { ListState } from '#/shared/components/list-state'
import { ListPage } from '#/shared/components/templates/list-page'
import { buttonVariants } from '#/shared/components/button-variants'

import { orderRuns, runState } from '../model/learning'
import { certificatesOptions, trailOptions } from '../queries'
import { MyCertificates } from './my-certificates'
import { RunItem } from './run-item'
import { StateFilter } from './state-filter'

/**
 * The learner's own courses with the server's progress, filterable by state in the URL, then their certificates; with
 * certificates the header links down to them (B-LRN-11), as 30 course cards stand between the title and the list.
 */
export function LearningPage() {
  const { state } = useSearch({ from: '/_authed/learning' })
  const navigate = useNavigate()
  const query = useSuspenseQuery(trailOptions())
  const runs = orderRuns(query.data.runs)
  const shown = state ? runs.filter(run => runState(run) === state) : runs
  const certificates = useSuspenseInfiniteQuery(certificatesOptions())
  const held = certificates.data.length
  return (
    <ListPage
      title={m.learning_title()}
      count={m.learning_course_count({ count: runs.length })}
      primaryAction={
        held > 0 ? (
          <RouterLink
            to="/learning"
            search={search => search}
            hash="my-certificates"
            className={buttonVariants({ variant: 'outline' })}
          >
            <Award data-icon="inline-start" aria-hidden />
            {certificates.hasNextPage
              ? m.learning_certificates_jump_more({ count: held })
              : m.learning_certificates_jump({ count: held })}
          </RouterLink>
        ) : undefined
      }
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
        <ul className="grid gap-5 @xl:grid-cols-2 @4xl:grid-cols-3">
          {shown.map(run => (
            <li key={run.id}>
              <RunItem run={run} />
            </li>
          ))}
        </ul>
      </ListState>
      <MyCertificates />
    </ListPage>
  )
}
