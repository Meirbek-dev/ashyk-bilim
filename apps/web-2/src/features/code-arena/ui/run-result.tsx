import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'

import { runOptions } from '../queries'
import { RunView } from './run-view'

/**
 * The run in `?run=` (B-COD-07, B-COD-08): its verdict and, per test, the verdict, time and memory; a visible test
 * also shows its input and both outputs. The run comes from the run's POST answer (cached) or `GET /code-runs/{id}`
 * after a reload; an unknown one shows nothing.
 */
export function RunResult({ runId }: { runId: string }) {
  const { data: run } = useSuspenseQuery(runOptions(runId))
  return run ? <RunView run={run} title={m.code_run_title()} /> : null
}
