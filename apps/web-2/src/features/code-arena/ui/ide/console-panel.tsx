import { Suspense } from 'react'

import { m } from '#/paraglide/messages'
import type { CodeTestCase } from '#/shared/api/gen/types.gen'
import { printedKeys } from '#/shared/lib/key-label'
import { Button } from '#/shared/ui/button'
import { Skeleton } from '#/shared/ui/skeleton'
import { Spinner } from '#/shared/ui/spinner'

import { CONSOLE_MODES, type ConsoleMode } from '../../model/ide'
import { RunResult } from '../run-result'
import { CustomInput } from './custom-input'
import { SampleCases } from './sample-cases'

const modeLabels: Record<ConsoleMode, () => string> = {
  cases: m.code_console_cases,
  input: m.code_console_input,
  result: m.code_console_result,
}

/**
 * The console's scroller as a named, focusable region: a long result scrolls by keyboard (WCAG 2.1.1, axe
 * `scrollable-region-focusable`), as the data table's scroller does.
 */
const scrollRegion = (label: string) => (box: HTMLDivElement | null) => {
  box?.setAttribute('tabindex', '0')
  box?.setAttribute('role', 'region')
  box?.setAttribute('aria-label', label)
}

type ConsolePanelProps = {
  mode: ConsoleMode
  onMode: (mode: ConsoleMode) => void
  samples: CodeTestCase[]
  input: string
  onInput: (input: string) => void
  /** The run in `?run=`. */
  runId: string | undefined
  running: boolean
}

/**
 * Under the editor (B-COD-29): the sample tests, an own input to run the code on, and the last run's result, one at
 * a time; the mode lives in `?console=`, so a reload keeps it.
 */
export function ConsolePanel({ mode, onMode, samples, input, onInput, runId, running }: ConsolePanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <fieldset className="flex shrink-0 flex-wrap gap-1 border-b px-2 py-1.5">
        <legend className="sr-only">{m.code_console()}</legend>
        {CONSOLE_MODES.map(option => (
          <Button
            key={option}
            size="sm"
            variant={option === mode ? 'secondary' : 'ghost'}
            aria-pressed={option === mode}
            onClick={() => onMode(option)}
          >
            {modeLabels[option]()}
          </Button>
        ))}
      </fieldset>
      <div ref={scrollRegion(modeLabels[mode]())} className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
        {mode === 'cases' ? <SampleCases samples={samples} /> : null}
        {mode === 'input' ? <CustomInput value={input} onChange={onInput} /> : null}
        {mode === 'result' ? (
          <div className="flex min-w-0 flex-col gap-3">
            {running ? (
              <output className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                {m.code_console_running()}
              </output>
            ) : null}
            {runId ? (
              <Suspense fallback={<Skeleton className="h-24 w-full" />}>
                <RunResult runId={runId} />
              </Suspense>
            ) : running ? null : (
              <p className="text-sm text-muted-foreground">
                {m.code_console_empty({ keys: printedKeys('Mod-Enter') })}
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
