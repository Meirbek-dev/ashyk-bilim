import { expect, test } from 'bun:test'

import { jobStates, transitions, type Run } from './ci-watch.ts'
import { summarize } from './diagnose.ts'
import { parse } from './e2e.ts'

test('persistent stand modes preserve Playwright arguments and reject conflicting lifecycles', () => {
  expect(parse(['web2', '--slot', '2', '--reuse', '--grep', 'B-COL-09'])).toMatchObject({
    app: 'web2',
    slot: '2',
    session: '--reuse',
    args: ['--grep', 'B-COL-09'],
  })
  expect(() => parse(['--serve', '--reuse'])).toThrow('choose only one')
  expect(() => parse(['--dev', '--serve'])).toThrow('production builds')
})

test('CI watcher stays quiet for unchanged polls and reports retried jobs', () => {
  const run: Run = {
    status: 'in_progress',
    conclusion: '',
    url: '',
    jobs: [
      { name: 'e2e (1)', status: 'in_progress', conclusion: '', steps: [{ name: 'setup', status: 'in_progress' }] },
      { name: 'e2e (2)', status: 'completed', conclusion: 'success' },
    ],
  }
  expect(transitions(jobStates(run), run)).toEqual([])
  const previous = jobStates(run)
  run.jobs[0]!.conclusion = 'failure'
  expect(transitions(previous, run)).toEqual(['e2e (1): failure'])
  const failed = jobStates(run)
  run.jobs[0]!.conclusion = ''
  expect(transitions(failed, run)).toEqual(['e2e (1): setup'])
})

async function* lines(values: string[]) {
  yield* values
}

test('diagnostics cap minified matches and total output before returning it', async () => {
  const output = await summarize(lines(Array.from({ length: 100 }, () => `Error: ${'x'.repeat(100_000)}`)))
  expect(output.length).toBeLessThanOrEqual(12_000)
  expect(output).toContain('Error:')
  expect(output).not.toMatch(/^1: Error:/m)
  expect(output).toContain('100: Error:')
})

test('trace diagnostics discard huge snapshots and retain action/error timing', async () => {
  const output = await summarize(
    lines([
      JSON.stringify({ type: 'frame-snapshot', snapshot: 'SECRET-SNAPSHOT'.repeat(1000) }),
      JSON.stringify({ type: 'before', startTime: 123, title: 'Click Save' }),
      JSON.stringify({ type: 'event', time: 125, method: 'pageError', params: { error: 'hydration failed' } }),
    ]),
    true,
  )
  expect(output).toContain('123: Click Save')
  expect(output).toContain('125: "hydration failed"')
  expect(output).not.toContain('SECRET-SNAPSHOT')
})
