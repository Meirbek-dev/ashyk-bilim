import { useId } from 'react'

import { m } from '#/paraglide/messages'
import type { CodeRun } from '#/shared/api/gen/types.gen'

import { Io } from './io'
import { runStatus } from './labels'
import { Usage } from './usage'
import { Verdict } from './verdict'

/** A program that ran to its end on an own input is not «accepted»: nothing was compared, it just ran. */
const ran = { label: m.code_custom_ran, tone: 'success' } as const

/** A run on the learner's own input (B-COD-29): did it run, how long and how much memory, what it printed. */
export function CustomRunView({ run }: { run: CodeRun }) {
  const id = useId()
  const result = run.cases[0]
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id={id} className="font-semibold">
          {m.code_custom_title()}
        </h2>
        <span className="text-sm">
          <Verdict status={run.status === 'accepted' ? ran : runStatus[run.status]} />
        </span>
        {result ? <Usage result={result} /> : null}
      </div>
      {run.compile_output ? <Io label={m.code_compile_output()} text={run.compile_output} /> : null}
      {result?.stdin === null || result?.stdin === undefined ? null : (
        <Io label={m.code_io_input()} text={result.stdin} />
      )}
      {result?.stdout === null || result?.stdout === undefined ? null : (
        <Io label={m.code_io_output()} text={result.stdout} />
      )}
      {result?.stderr ? <Io label={m.code_io_stderr()} text={result.stderr} /> : null}
    </section>
  )
}
