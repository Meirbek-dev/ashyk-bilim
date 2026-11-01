import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'

import { runOptions } from '../queries'
import { CustomRunView } from './custom-run-view'
import { RunView } from './run-view'

/**
 * The run in `?run=` (B-COD-07, B-COD-08): its verdict and, per test, the verdict, time and memory; a visible test
 * also shows its input and both outputs. A run on an own input shows what the program printed (B-COD-29). The run
 * comes from the run's POST answer (cached) or `GET /code-runs/{id}` after a reload; an unknown one shows nothing.
 */
export function RunResult({ runId }: { runId: string }) {
  const { data: run } = useSuspenseQuery(runOptions(runId))
  if (!run) return null
  return run.purpose === 'custom' ? <CustomRunView run={run} /> : <RunView run={run} title={m.code_run_title()} />
}
