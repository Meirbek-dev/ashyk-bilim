import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDateTime } from '#/shared/i18n/format'
import { buttonVariants } from '#/shared/ui/button'

import { myRunsOptions } from '../queries'
import { ARENA_PATH } from './arena-route'
import { runStatus } from './labels'

/**
 * The learner's own "Run"s of the item, newest first (B-COD-21): when, the verdict and "N of M"; "Results" opens the
 * run's per-test table in `?run=`.
 */
export function RunList({ itemId, selected }: { itemId: string; selected: string | undefined }) {
  const { data: runs } = useSuspenseQuery(myRunsOptions(itemId))
  if (runs.length === 0) return null
  return (
    <section aria-labelledby="code-runs" className="flex min-w-0 flex-col gap-2">
      <h2 id="code-runs" className="text-xl font-semibold">
        {m.code_runs()}
      </h2>
      <ul className="flex flex-col divide-y text-sm">
        {runs.map(run => {
          const status = runStatus[run.status]
          const open = run.id === selected
          const when = formatDateTime(run.created_at_unix)
          return (
            <li key={run.id} className="flex min-h-row flex-wrap items-center gap-x-4 gap-y-1 py-2">
              <span className="text-muted-foreground">{when}</span>
              <StatusBadge tone={status.tone}>{status.label()}</StatusBadge>
              {run.total > 0 ? (
                <span className="tabular-nums">{m.code_run_passed({ passed: run.passed, total: run.total })}</span>
              ) : null}
              <RouterLink
                from={ARENA_PATH}
                to="."
                search={previous => ({ ...previous, run: open ? undefined : run.id })}
                aria-current={open ? 'true' : undefined}
                aria-label={m.code_run_open({ when })}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                {m.code_run_results()}
              </RouterLink>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
