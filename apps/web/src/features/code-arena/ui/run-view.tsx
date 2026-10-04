import { useId } from 'react'

import { m } from '#/paraglide/messages'
import type { CodeRun } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatNumber } from '#/shared/i18n/format'

import { caseVerdict } from '../model/verdict'
import { Io } from './io'
import { caseStatus, runStatus } from './labels'

const ms = (seconds: number | null) => formatNumber(Math.round((seconds ?? 0) * 1000))
const mb = (kb: number | null) => formatNumber(Math.round((kb ?? 0) / 102.4) / 10)

type RunViewProps = { run: CodeRun; title: string; level?: 2 | 3 }

/** One run's verdict and its per-test table: the run in `?run=`, or the final run of a graded attempt (B-COD-22). */
export function RunView({ run, title, level = 2 }: RunViewProps) {
  const id = useId()
  const Heading = level === 2 ? 'h2' : 'h3'
  const status = runStatus[run.status]
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Heading id={id} className={level === 2 ? 'text-xl font-semibold' : 'font-semibold'}>
          {title}
        </Heading>
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
