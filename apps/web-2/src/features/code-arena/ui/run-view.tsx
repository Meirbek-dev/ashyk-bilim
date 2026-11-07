import { useId } from 'react'

import { m } from '#/paraglide/messages'
import type { CodeRun } from '#/shared/api/gen/types.gen'
import { formatNumber } from '#/shared/i18n/format'

import { firstDifference } from '../model/ide'
import { caseVerdict } from '../model/verdict'
import { Io } from './io'
import { caseStatus, runStatus } from './labels'
import { Usage } from './usage'
import { Verdict } from './verdict'

type RunViewProps = { run: CodeRun; title: string; level?: 2 | 3 }

/** One run's verdict and its per-test table: the run in `?run=`, or the final run of a graded attempt (B-COD-22). */
export function RunView({ run, title, level = 2 }: RunViewProps) {
  const id = useId()
  const Heading = level === 2 ? 'h2' : 'h3'
  const status = runStatus[run.status]
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-4">
      {/* The verdict leads: tests passed as a ring, the verdict word beside it. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Heading id={id} className={level === 2 ? 'text-lg font-semibold' : 'text-base font-semibold'}>
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
        {run.total > 0 ? (
          <p aria-hidden className="font-heading text-2xl tabular-nums">
            {formatNumber(run.passed)}
            <span className="text-muted-foreground">/{formatNumber(run.total)}</span>
          </p>
        ) : null}
      </div>
      {run.compile_output ? <Io label={m.code_compile_output()} text={run.compile_output} /> : null}
      <ol className="flex flex-col divide-y border-y">
        {run.cases.map((result, index) => {
          const kind = caseVerdict(result)
          const verdict = caseStatus[kind]
          return (
            <li key={result.test_id} className="flex min-w-0 flex-col gap-2 py-2.5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className="font-medium">{result.description || m.code_case({ number: index + 1 })}</span>
                <span className="self-center">
                  <Verdict status={verdict} />
                </span>
                <span className="ms-auto">
                  <Usage result={result} />
                </span>
              </div>
              {result.is_visible ? (
                <div className="grid min-w-0 gap-2 @3xl:grid-cols-3">
                  {result.stdin === null ? null : <Io label={m.code_io_input()} text={result.stdin} />}
                  {result.expected === null ? null : <Io label={m.code_io_expected()} text={result.expected} />}
                  {result.actual === null ? null : (
                    <Io
                      label={m.code_io_actual()}
                      text={result.actual}
                      // Where a wrong answer goes wrong, so the learner does not compare two columns by eye.
                      mark={kind === 'wrong_answer' ? firstDifference(result.expected ?? '', result.actual) : null}
                    />
                  )}
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
