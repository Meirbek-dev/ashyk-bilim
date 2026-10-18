import { useId } from 'react'

import { m } from '#/paraglide/messages'
import type { CodeRun } from '#/shared/api/gen/types.gen'
import { ProgressRing } from '#/shared/components/progress-ring'
import { formatNumber } from '#/shared/i18n/format'

import { caseVerdict } from '../model/verdict'
import { Io } from './io'
import { caseStatus, runStatus } from './labels'
import { Verdict } from './verdict'

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
      {/* The verdict leads: tests passed as a ring, the verdict word beside it. */}
      <div className="flex items-center gap-3">
        {run.total > 0 ? (
          <ProgressRing value={(run.passed / run.total) * 100} className="size-12">
            <span className="text-xs font-semibold tabular-nums">
              {formatNumber(run.passed)}/{formatNumber(run.total)}
            </span>
          </ProgressRing>
        ) : null}
        <div className="flex min-w-0 flex-col">
          <Heading id={id} className={level === 2 ? 'text-xl font-semibold' : 'font-semibold'}>
            {title}
          </Heading>
          <p className="flex flex-wrap items-center gap-x-3 text-sm">
            <Verdict status={status} />
            {run.total > 0 ? (
              <span className="text-muted-foreground tabular-nums">
                {m.code_run_passed({ passed: run.passed, total: run.total })}
              </span>
            ) : null}
          </p>
        </div>
      </div>
      {run.compile_output ? <Io label={m.code_compile_output()} text={run.compile_output} /> : null}
      <ol className="flex flex-col divide-y border-y">
        {run.cases.map((result, index) => {
          const kind = caseVerdict(result)
          const verdict = caseStatus[kind]
          return (
            <li key={result.test_id} className="flex min-w-0 flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-medium">{result.description || m.code_case({ number: index + 1 })}</span>
                <span className="text-sm">
                  <Verdict status={verdict} />
                </span>
                {/* A killed run's numbers are the sandbox's last sample («4 мс» on a time limit): not shown. */}
                {kind === 'time_limit' || (result.time_seconds === null && result.memory_kb === null) ? null : (
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
              {/* Why a visible test crashed (the traceback, «SyntaxError»): the learner cannot fix it blind. */}
              {result.is_visible && result.stderr ? <Io label={m.code_io_stderr()} text={result.stderr} /> : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
