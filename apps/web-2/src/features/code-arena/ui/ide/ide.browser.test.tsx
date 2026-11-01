import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, useState } from 'react'
import { describe, expect, test, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import type { CaseResult, CodeRun, CodeTestCase } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { DEFAULT_PREFS, type ConsoleMode, type EditorPrefs } from '../../model/ide'
import { runOptions } from '../../queries'
import { RunView } from '../run-view'
import { ConsolePanel } from './console-panel'
import { EditorSettings } from './editor-settings'
import { SplitPane } from './split-pane'

const samples: CodeTestCase[] = [
  { id: 't1', description: null, input: '1 2', expected_output: '3', is_visible: true },
  { id: 't2', description: null, input: '5 7', expected_output: '12', is_visible: true },
]

const result = (patch: Partial<CaseResult>): CaseResult => ({
  test_id: 'custom',
  passed: true,
  is_visible: true,
  status_id: 3,
  status_description: 'Accepted',
  description: '',
  weight: 1,
  stdin: '40 2',
  expected: null,
  actual: '42',
  stdout: '42\n',
  stderr: null,
  compile_output: null,
  message: null,
  time_seconds: 0.012,
  memory_kb: 7800,
  ...patch,
})

const run = (patch: Partial<CodeRun>): CodeRun => ({
  id: '0190a5d2-0000-7000-8000-0000000001a1',
  assessment_id: '0190a5d2-0000-7000-8000-0000000000a1',
  item_id: '0190a5d2-0000-7000-8000-0000000000c1',
  cases: [result({})],
  compile_output: null,
  created_at_unix: 1_760_000_000,
  error_message: null,
  finished_at_unix: 1_760_000_000,
  language_id: 71,
  passed: 0,
  total: 1,
  purpose: 'custom',
  replayed: false,
  score: null,
  status: 'accepted',
  submission_id: null,
  ...patch,
})

/** The console as the workspace holds it: the mode and the own input in state, the run in the query cache. */
function Console({ runId }: { runId?: string }) {
  const [mode, setMode] = useState<ConsoleMode>('cases')
  const [input, setInput] = useState('1 2')
  return (
    <ConsolePanel
      mode={mode}
      onMode={setMode}
      samples={samples}
      input={input}
      onInput={setInput}
      runId={runId}
      running={false}
    />
  )
}

describe('B-COD-29 B-COD-30 B-COD-31 the workspace', () => {
  test('B-COD-29 the console shows the samples, takes an own input and shows what a run on it printed', async () => {
    // Fresh for good: a refetch would ask an API the test does not have.
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
    const custom = run({})
    client.setQueryData(runOptions(custom.id).queryKey, custom)
    const screen = await renderInRouter(
      <QueryClientProvider client={client}>
        <Suspense>
          <Console runId={custom.id} />
        </Suspense>
      </QueryClientProvider>,
    )
    await screen.getByRole('button', { name: m.code_sample({ number: 2 }) }).click()
    await expect.element(screen.getByText('5 7')).toBeVisible()
    await screen.getByRole('button', { name: m.code_console_input() }).click()
    const input = screen.getByRole('textbox', { name: m.code_custom_input() })
    await input.fill('40 2')
    await expect.element(input).toHaveValue('40 2')
    await screen.getByRole('button', { name: m.code_console_result() }).click()
    await expect.element(screen.getByRole('heading', { name: m.code_custom_title() })).toBeVisible()
    await expect.element(screen.getByText(m.code_custom_ran())).toBeVisible()
    await expect.element(screen.getByText(m.code_io_output())).toBeVisible()
  })

  test('B-COD-30 the divider moves by the arrows; a setting applies at once', async () => {
    const onShare = vi.fn<(share: number) => void>()
    const onChange = vi.fn<(patch: Partial<EditorPrefs>) => void>()
    const screen = await renderInRouter(
      <div className="flex h-96 flex-col">
        <EditorSettings prefs={DEFAULT_PREFS} onChange={onChange} />
        <SplitPane
          top={<p>{m.code_editor_label()}</p>}
          bottom={<p>{m.code_console()}</p>}
          share={0.6}
          onShare={onShare}
          label={m.code_split()}
        />
      </div>,
    )
    const divider = screen.getByRole('slider', { name: m.code_split() })
    await expect.element(divider).toHaveAttribute('aria-valuetext', m.code_split_value({ percent: 60 }))
    divider.element().focus()
    await userEvent.keyboard('{ArrowDown}')
    // Down gives the editor more room: the slider counts the console's share from the bottom.
    await expect.poll(() => onShare.mock.lastCall?.[0]).toBeCloseTo(0.65)
    await screen.getByRole('button', { name: m.code_settings() }).click()
    await screen.getByRole('button', { name: m.code_font_large() }).click()
    expect(onChange).toHaveBeenLastCalledWith({ fontSize: 'lg' })
    await screen.getByRole('switch', { name: m.code_wrap() }).click()
    expect(onChange).toHaveBeenLastCalledWith({ wrap: true })
  })

  test('B-COD-31 a wrong answer marks the line where the output departs from the expected one', async () => {
    const wrong = run({
      purpose: 'visible',
      status: 'wrong_answer',
      cases: [result({ test_id: 't1', passed: false, status_id: 4, stdin: '1 2', expected: '3\n4', actual: '3\n5' })],
    })
    const screen = await renderInRouter(<RunView run={wrong} title={m.code_run_title()} />)
    await expect.element(screen.getByText(m.code_diff_line({ line: '2' }))).toBeVisible()
  })
})
