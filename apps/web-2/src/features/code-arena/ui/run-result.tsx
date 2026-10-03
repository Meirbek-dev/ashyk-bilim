import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatNumber } from '#/shared/i18n/format'

import { caseVerdict } from '../model/verdict'
import { runOptions } from '../queries'
import { Io } from './io'
import { caseStatus, runStatus } from './labels'

const ms = (seconds: number | null) => formatNumber(Math.round((seconds ?? 0) * 1000))
const mb = (kb: number | null) => formatNumber(Math.round((kb ?? 0) / 102.4) / 10)

/**
 * The run in `?run=` (B-COD-07, B-COD-08): its verdict and, per test, the verdict, time and memory; a visible test
 * also shows its input and both outputs. The run comes from the run's POST answer (cached) or `GET /code-runs/{id}`
 * after a reload; an unknown one shows nothing.
 */
export function RunResult({ runId }: { runId: string }) {
  const { data: run } = useSuspenseQuery(runOptions(runId))
  if (!run) return null
  const status = runStatus[run.status]
  return (
    <section aria-labelledby="code-run" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="code-run" className="text-xl font-semibold">
          {m.code_run_title()}
        </h2>
        <StatusBadge tone={status.tone}>{status.label()}</StatusBadge>
        {run.total > 0 ? (
          <span className="text-sm tabular-nums">{m.code_run_passed({ passed: run.passed, total: run.total })}</span>
        ) : null}
      </div>
      {run.compile_output ? <Io label={m.code_compile_output()} text={run.compile_output} /> : null}
      <ol className="flex flex-col divide-y">
        {run.cases.map((result, index) => {
          const verdict = caseStatus[caseVerdict(result)]
          return (
            <li key={result.test_id} className="flex min-w-0 flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-medium">{result.description || m.code_case({ number: index + 1 })}</span>
                <StatusBadge tone={verdict.tone}>{verdict.label()}</StatusBadge>
                {result.time_seconds === null && result.memory_kb === null ? null : (
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {m.code_case_usage({ ms: ms(result.time_seconds), mb: mb(result.memory_kb) })}
                  </span>
                )}
              </div>
              {result.is_visible ? (
                <div className="grid min-w-0 gap-2 @3xl:grid-cols-3">
                  {result.stdin === null ? null : <Io label={m.code_io_input()} text={result.stdin} />}
                  {result.expected === null ? null : <Io label={m.code_io_expected()} text={result.expected} />}
                  {result.actual === null ? null : <Io label={m.code_io_actual()} text={result.actual} />}
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
